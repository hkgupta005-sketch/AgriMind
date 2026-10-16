"""Accounts and sessions.

Every browser gets a private guest account on first visit (POST /api/auth/guest); the token is
the only key to its records. A guest can later register a username + password to keep the
records on other devices. Tokens are stored hashed; passwords use scrypt.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .config import settings
from .db import DB_STATUS, get_db
from .models import AuthSession, User, now

SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1, "dklen": 32}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored or not stored.startswith("scrypt$"):
        return False
    _, salt_hex, digest_hex = stored.split("$")
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), **SCRYPT)
    return hmac.compare_digest(digest.hex(), digest_hex)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(user_id=user.id, token_hash=_token_hash(token),
                       expires_at=now() + timedelta(days=settings.session_days)))
    db.commit()
    return token


def end_session(db: Session, token: str):
    row = db.scalar(select(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
    if row:
        db.delete(row)
        db.commit()


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def require_db():
    if not DB_STATUS["ok"]:
        raise HTTPException(503, {"code": "no_database",
                                  "message": "Saving and login are not available: no database is connected.",
                                  "detail": DB_STATUS["error"]})


def current_user(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> User:
    """The signed-in (or guest) user. The user id always comes from the token, never the request body."""
    require_db()
    token = _bearer(authorization)
    if not token:
        raise HTTPException(401, "Not signed in")
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
    if not session or session.expires_at < now():
        raise HTTPException(401, "Session expired, please sign in again")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "Account not found")
    return user


def optional_user(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> User | None:
    """Like current_user, but predictions still work without a session or database."""
    if not DB_STATUS["ok"] or not _bearer(authorization):
        return None
    try:
        return current_user(authorization, db)
    except HTTPException:
        return None
    except SQLAlchemyError:  # database dropped: still predict, just don't save
        return None
