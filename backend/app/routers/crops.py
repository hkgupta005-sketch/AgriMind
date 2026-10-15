from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..ml import crop
from ..models import CropRecommendation, User
from ..schemas import CropIn
from ..services import activity
from .common import Page, call_model, iso, owned, paginate

router = APIRouter(prefix="/api/crops", tags=["Crop analysing"])


def record_out(r: CropRecommendation):
    return {"id": r.id, "crop": r.crop, "confidence": r.confidence, "top": r.top, "inputs": r.inputs,
            "assumed": r.assumed, "warnings": r.warnings, "created_at": iso(r.created_at)}


@router.post("/recommend")
async def recommend(body: CropIn, user: User | None = Depends(auth.optional_user), db: Session = Depends(get_db)):
    values = body.model_dump(exclude={"save", "rainfall_preset"})
    if values["rainfall"] is None:
        values["rainfall"] = await call_model(crop.rain_preset, body.rainfall_preset)
    r = await call_model(crop.predict, values)
    if body.rainfall is None:
        r["rainfall_preset"] = body.rainfall_preset
    r["saved_id"] = None
    if user and body.save:
        row = CropRecommendation(user_id=user.id, crop=r["crop"], confidence=r["confidence"], top=r["top"],
                                 inputs=r["inputs"], assumed=r["assumed"], warnings=r["warnings"])
        db.add(row)
        activity.log(db, user.id, "crop", f"Best crop: {r['crop'].title()}", f"{r['confidence']:g}% match",
                     "/crop-analysis")
        db.commit()
        r["saved_id"] = row.id
    return r


@router.get("/history")
def history(page: Page = Depends(), user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    return paginate(db, CropRecommendation, user.id, page, record_out)


@router.delete("/history/{record_id}")
def delete(record_id: int, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, CropRecommendation, record_id, user.id))
    db.commit()
    return {"ok": True}
