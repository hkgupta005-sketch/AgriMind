from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..ml import irrigation
from ..models import IrrigationRecord, User
from ..schemas import IrrigationQuick
from ..services import activity
from .common import Page, call_model, iso, owned, paginate

router = APIRouter(prefix="/api/irrigation", tags=["Pre-irrigation"])


def record_out(r: IrrigationRecord):
    return {"id": r.id, "crop": r.crop, "growth_stage": r.growth_stage, "season": r.season,
            "soil_moisture_pct": r.soil_moisture_pct, "soil_moisture_source": r.soil_moisture_source,
            "need": r.need, "advice": r.advice, "assumed": r.assumed, "warnings": r.warnings,
            "inputs": r.inputs, "created_at": iso(r.created_at)}


@router.post("/quick")
async def quick(body: IrrigationQuick, user: User | None = Depends(auth.optional_user), db: Session = Depends(get_db)):
    data = body.model_dump()
    r = await call_model(irrigation.predict, data)
    r["saved_id"] = None
    if user and body.save:
        row = IrrigationRecord(user_id=user.id, crop=r["used"]["Crop"], growth_stage=r["used"]["Growth stage"],
                               season=r["used"]["Season"], soil_moisture_pct=r["soil_moisture_pct"],
                               soil_moisture_source=r["soil_moisture_source"], need=r["need"], advice=r["advice"],
                               inputs=data, assumed=r["assumed"], warnings=r["warnings"])
        db.add(row)
        activity.log(db, user.id, "irrigation", f"Irrigation check: {r['need']} need",
                     f"{r['used']['Crop']}, {r['used']['Growth stage'].lower()} stage", "/irrigation")
        db.commit()
        r["saved_id"] = row.id
    return r


@router.get("/history")
def history(page: Page = Depends(), user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    return paginate(db, IrrigationRecord, user.id, page, record_out)


@router.delete("/history/{record_id}")
def delete(record_id: int, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, IrrigationRecord, record_id, user.id))
    db.commit()
    return {"ok": True}
