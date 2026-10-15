"""Database engine and session (MySQL, or SQLite when no MySQL password is configured)."""

import logging

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

log = logging.getLogger("agrimind.db")


class Base(DeclarativeBase):
    pass


if settings.use_mysql:
    engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800, future=True)
else:
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(settings.database_url, connect_args={"check_same_thread": False}, future=True)

    @event.listens_for(engine, "connect")
    def _sqlite_fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

DB_STATUS = {"backend": "mysql" if settings.use_mysql else "sqlite", "ok": False, "error": None}


def init_db():
    """Create missing tables (see backend/schema.sql for the MySQL DDL)."""
    from . import models  # noqa: F401  (registers the tables)
    try:
        Base.metadata.create_all(engine)
        DB_STATUS["ok"] = True
        log.info("Database ready (%s)", DB_STATUS["backend"])
    except Exception as e:  # keep the API up; predictions still work without a database
        DB_STATUS["error"] = type(e).__name__
        log.error("Database unavailable: %s", e)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
