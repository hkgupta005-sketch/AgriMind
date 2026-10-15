from datetime import timedelta

from fastapi import HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import now

RANGES = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}


async def call_model(fn, *args, **kwargs):
    """Run a (blocking) model call off the event loop. Bad names/values -> 400 with the reason."""
    try:
        return await run_in_threadpool(fn, *args, **kwargs)
    except HTTPException:
        raise
    except (ValueError, KeyError) as e:
        raise HTTPException(400, str(e).strip("'\""))


def since_from(range_: str | None):
    days = RANGES.get(range_ or "")
    return now() - timedelta(days=days) if days else None


class Page:
    def __init__(self, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                 range: str | None = Query(None, pattern="^(7d|30d|90d|365d|all)$")):
        self.page, self.page_size, self.since = page, page_size, since_from(range)


def paginate(db: Session, model, user_id: int, page: Page, serialize, extra=None):
    """Owner-filtered, newest first."""
    q = select(model).where(model.user_id == user_id)
    if extra is not None:
        q = q.where(extra)
    if page.since is not None:
        q = q.where(model.created_at >= page.since)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(model.created_at.desc(), model.id.desc())
                      .offset((page.page - 1) * page.page_size).limit(page.page_size)).all()
    return {"items": [serialize(r) for r in rows], "total": total, "page": page.page, "page_size": page.page_size}


def iso(dt):
    return dt.isoformat() + "Z" if dt else None


def owned(db: Session, model, record_id, user_id):
    row = db.get(model, record_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(404, "Record not found")
    return row
