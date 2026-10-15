from sqlalchemy.orm import Session

from ..models import UserActivity


def log(db: Session, user_id: int, kind: str, title: str, detail: str | None = None, link: str | None = None):
    db.add(UserActivity(user_id=user_id, kind=kind, title=title[:160],
                        detail=(detail or "")[:255] or None, link=link))
