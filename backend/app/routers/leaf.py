from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import auth
from ..config import settings
from ..db import get_db
from ..ml import leaf
from ..models import LeafPrediction, User
from ..services import activity
from .common import Page, iso, owned, paginate

router = APIRouter(prefix="/api/leaf", tags=["Leaf prediction"])


def record_out(r: LeafPrediction):
    return {"id": r.id, "plant": r.plant, "condition": r.condition, "is_healthy": r.is_healthy,
            "confidence": r.confidence, "top": r.top_predictions, "raw_class": r.raw_class,
            "thumbnail": r.thumbnail, "created_at": iso(r.created_at)}


async def read_upload(photo: UploadFile) -> bytes:
    data = await photo.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "The photo is larger than 8 MB. Please use a smaller photo.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    return data


@router.post("/predict")
async def predict(photo: UploadFile = File(...), save: bool = Form(True),
                  user: User | None = Depends(auth.optional_user), db: Session = Depends(get_db)):
    data = await read_upload(photo)
    try:
        r = await run_in_threadpool(leaf.predict_bytes, data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    r["saved_id"] = None
    if user and save:
        row = LeafPrediction(user_id=user.id, raw_class=r["raw_class"], plant=r["plant"], condition=r["condition"],
                             is_healthy=r["is_healthy"], confidence=r["confidence"], top_predictions=r["top"],
                             thumbnail=await run_in_threadpool(leaf.thumbnail, data))
        db.add(row)
        activity.log(db, user.id, "leaf", f"Leaf check: {r['plant']} — {r['condition']}",
                     f"{r['confidence']:.0f}% confidence", "/leaf-prediction")
        db.commit()
        r["saved_id"] = row.id
    return r


@router.get("/history")
def history(page: Page = Depends(), user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    return paginate(db, LeafPrediction, user.id, page, record_out)


@router.delete("/history/{record_id}")
def delete(record_id: int, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, LeafPrediction, record_id, user.id))
    db.commit()
    return {"ok": True}
