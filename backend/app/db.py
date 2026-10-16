"""Database engine and session: MySQL, SQLite (local default) or none (DB_MODE=none / on Render).

Without a working database the API still runs: predictions and the assistant work, while
saving, history and login answer 503 "Saving is unavailable".
"""

import logging

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

log = logging.getLogger("agrimind.db")


class Base(DeclarativeBase):
    pass


engine = None
if settings.use_mysql:
    # short timeout: an unreachable MySQL must not stall startup or requests
    engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800, future=True,
                           connect_args={"connection_timeout": 5})
elif settings.use_db:
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(settings.database_url, connect_args={"check_same_thread": False}, future=True)

    @event.listens_for(engine, "connect")
    def _sqlite_fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False) if engine else None

DB_STATUS = {"backend": settings.db_mode, "ok": False, "error": None}


def init_db():
    """Create missing tables (see backend/schema.sql for the MySQL DDL)."""
    if engine is None:
        DB_STATUS["error"] = "disabled"
        log.info("No database configured (DB_MODE=none): saving and login are turned off")
        return
    from . import models  # noqa: F401  (registers the tables)
    try:
        Base.metadata.create_all(engine)
        DB_STATUS["ok"] = True
        log.info("Database ready (%s)", DB_STATUS["backend"])
    except Exception as e:  # keep the API up; predictions still work without a database
        DB_STATUS["error"] = type(e).__name__
        log.error("Database unavailable, saving and login are turned off: %s", e)


def get_db():
    """A session, or None when there is no database (routes only use it after auth.require_db)."""
    if SessionLocal is None or not DB_STATUS["ok"]:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
