from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..ml import production
from ..models import CropProductionRecord, ProductionEstimate, User
from ..schemas import ProductionEstimateIn, ProductionRecordIn
from ..services import activity
from .common import Page, call_model, iso, owned, paginate

router = APIRouter(prefix="/api/production", tags=["Crop production"])


def estimate_out(e: ProductionEstimate):
    return {"id": e.id, "state": e.state, "district": e.district, "season": e.season, "crop": e.crop,
            "crop_year": e.crop_year, "area_ha": e.area_ha, "yield_t_per_ha": e.yield_t_per_ha,
            "production_t": e.production_t, "note": e.note, "created_at": iso(e.created_at)}


def record_out(r: CropProductionRecord):
    return {"id": r.id, "crop": r.crop, "season": r.season, "crop_year": r.crop_year, "area_ha": r.area_ha,
            "state": r.state, "district": r.district,
            "sowing_date": r.sowing_date.isoformat() if r.sowing_date else None,
            "harvest_date": r.harvest_date.isoformat() if r.harvest_date else None,
            "actual_production_t": r.actual_production_t, "estimated_production_t": r.estimated_production_t,
            "notes": r.notes, "created_at": iso(r.created_at), "updated_at": iso(r.updated_at)}


@router.post("/estimate")
async def estimate(body: ProductionEstimateIn, user: User | None = Depends(auth.optional_user),
                   db: Session = Depends(get_db)):
    r = await call_model(production.predict, body.state, body.district, body.season, body.crop,
                         body.year, body.area_ha)
    r["area_input"] = {"value": body.area, "unit": body.area_unit}
    r["saved_id"] = None
    if user and body.save:
        row = ProductionEstimate(user_id=user.id, state=r["state"], district=r["district"], season=r["season"],
                                 crop=r["crop"], crop_year=body.year, area_ha=r["area"],
                                 yield_t_per_ha=r["yield_per_ha"], production_t=r["production"], note=r["note"])
        db.add(row)
        activity.log(db, user.id, "production", f"Yield estimate: {r['crop']} in {r['district'].title()}",
                     f"≈ {r['production']:,.2f} t on {r['area']:g} ha", "/production")
        db.commit()
        r["saved_id"] = row.id
    return r


@router.get("/district-history")
async def district_history(state: str, district: str, crop: str, season: str | None = None):
    rows = await call_model(production.district_history, state, district, crop, season)
    return {"available": rows is not None, "rows": rows or [],
            "source": "India district crop statistics (crop_production.csv, about 1997–2015)",
            "unit": "tonnes per hectare"}


@router.get("/estimates")
def estimates(page: Page = Depends(), user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    return paginate(db, ProductionEstimate, user.id, page, estimate_out)


@router.delete("/estimates/{estimate_id}")
def delete_estimate(estimate_id: int, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, ProductionEstimate, estimate_id, user.id))
    db.commit()
    return {"ok": True}


@router.post("/track")
def track(body: ProductionRecordIn, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    row = CropProductionRecord(user_id=user.id, **body.model_dump())
    db.add(row)
    activity.log(db, user.id, "tracking", f"Season recorded: {body.crop} {body.season} {body.crop_year}",
                 f"{body.area_ha:g} ha" + (f", harvested {body.actual_production_t:g} t"
                                           if body.actual_production_t is not None else ""), "/production?tab=track")
    db.commit()
    return record_out(row)


@router.get("/history")
def history(page: Page = Depends(), crop: str | None = Query(None, max_length=80),
            user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    extra = CropProductionRecord.crop == crop if crop else None
    return paginate(db, CropProductionRecord, user.id, page, record_out, extra)


@router.get("/{record_id}")
def get_record(record_id: int, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    return record_out(owned(db, CropProductionRecord, record_id, user.id))


@router.put("/{record_id}")
def update_record(record_id: int, body: ProductionRecordIn, user: User = Depends(auth.current_user),
                  db: Session = Depends(get_db)):
    row = owned(db, CropProductionRecord, record_id, user.id)
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    db.commit()
    return record_out(row)


@router.delete("/{record_id}")
def delete_record(record_id: int, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, CropProductionRecord, record_id, user.id))
    db.commit()
    return {"ok": True}
