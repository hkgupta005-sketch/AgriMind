"""Guest sessions, register/login, farmer profile, delete my data."""

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..models import FarmerProfile, User
from ..schemas import Credentials, ProfileIn
from .common import iso

router = APIRouter(prefix="/api", tags=["Account"])


def user_out(user: User):
    return {"id": user.id, "username": user.username, "is_guest": user.is_guest, "created_at": iso(user.created_at)}


def profile_out(p: FarmerProfile | None):
    if p is None:
        return {"display_name": None, "state": None, "district": None, "farm_area_ha": None, "soil_type": None,
                "area_unit": "ha", "weight_unit": "quintal", "common_crops": []}
    return {"display_name": p.display_name, "state": p.state, "district": p.district,
            "farm_area_ha": p.farm_area_ha, "soil_type": p.soil_type, "area_unit": p.area_unit,
            "weight_unit": p.weight_unit, "common_crops": p.common_crops or []}


@router.post("/auth/guest")
def start_guest(db: Session = Depends(get_db)):
    """A private guest account for this browser. Its token is the only key to its records."""
    auth.require_db()
    user = User(is_guest=True)
    db.add(user)
    db.commit()
    token = auth.new_session(db, user)
    return {"token": token, "user": user_out(user)}


@router.post("/auth/register")
def register(body: Credentials, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    """Turn the current guest account (and all its records) into a named account."""
    if not user.is_guest:
        raise HTTPException(400, "You already have an account. Sign out first to create another.")
    user.username = body.username.lower()
    user.password_hash = auth.hash_password(body.password)
    user.is_guest = False
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "That username is taken. Please choose another.")
    return {"user": user_out(user)}


@router.post("/auth/login")
def login(body: Credentials, db: Session = Depends(get_db)):
    auth.require_db()
    user = db.scalar(select(User).where(User.username == body.username.lower()))
    if not user or not auth.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password")
    token = auth.new_session(db, user)
    return {"token": token, "user": user_out(user)}


@router.post("/auth/logout")
def logout(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    token = auth._bearer(authorization)
    if token:
        auth.end_session(db, token)
    return {"ok": True}


@router.get("/auth/me")
def me(user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    return {"user": user_out(user), "profile": profile_out(db.get(FarmerProfile, user.id))}


@router.put("/profile")
def save_profile(body: ProfileIn, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    p = db.get(FarmerProfile, user.id) or FarmerProfile(user_id=user.id)
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.add(p)
    db.commit()
    return {"profile": profile_out(p)}


@router.delete("/account")
def delete_account(user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    """Delete the account and every record that belongs to it (cascades)."""
    db.delete(user)
    db.commit()
    return {"ok": True}
