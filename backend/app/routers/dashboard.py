"""Dashboard overview built only from the user's own saved records (never invented)."""

from collections import Counter

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..models import (CropProductionRecord, CropRecommendation, FarmerProfile, IrrigationRecord, LeafPrediction,
                      PriceEstimate, ProductionEstimate, User, UserActivity)
from .account import profile_out
from .common import Page, iso, paginate, since_from
from .crops import record_out as crop_out
from .irrigation import record_out as irrigation_out
from .leaf import record_out as leaf_out
from .market import record_out as price_out
from .production import estimate_out, record_out as production_out

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _latest(db, model, user_id, extra=None):
    q = select(model).where(model.user_id == user_id)
    if extra is not None:
        q = q.where(extra)
    return db.scalar(q.order_by(model.created_at.desc(), model.id.desc()).limit(1))


def _rows(db, model, user_id, since, extra=None, limit=200):
    q = select(model).where(model.user_id == user_id)
    if since is not None:
        q = q.where(model.created_at >= since)
    if extra is not None:
        q = q.where(extra)
    return db.scalars(q.order_by(model.created_at.asc()).limit(limit)).all()


@router.get("/summary")
def summary(range: str | None = Query(None, pattern="^(7d|30d|90d|365d|all)$"),
            crop: str | None = Query(None, max_length=80), commodity: str | None = Query(None, max_length=120),
            user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    since = since_from(range)
    uid = user.id

    est = _latest(db, ProductionEstimate, uid, ProductionEstimate.crop == crop if crop else None)
    rec = _latest(db, CropProductionRecord, uid, CropProductionRecord.crop == crop if crop else None)
    production_crop = crop or (est.crop if est else rec.crop if rec else None)
    series = {}
    if production_crop:
        for e in _rows(db, ProductionEstimate, uid, since, ProductionEstimate.crop == production_crop):
            series.setdefault(e.crop_year, {})["estimate_t"] = e.production_t
        for r in _rows(db, CropProductionRecord, uid, since, CropProductionRecord.crop == production_crop):
            if r.actual_production_t is not None:
                series.setdefault(r.crop_year, {})["actual_t"] = r.actual_production_t
    production_series = [{"year": y, **v} for y, v in sorted(series.items())]

    last_price = _latest(db, PriceEstimate, uid, PriceEstimate.commodity == commodity if commodity else None)
    price_commodity = commodity or (last_price.commodity if last_price else None)
    price_series = []
    if price_commodity:
        price_series = [{"date": iso(p.created_at), "market": p.market, "estimate": p.price_per_quintal,
                         "low": p.range_low, "high": p.range_high}
                        for p in _rows(db, PriceEstimate, uid, since, PriceEstimate.commodity == price_commodity)]

    irrigation_rows = _rows(db, IrrigationRecord, uid, since)
    counts = Counter(r.need for r in irrigation_rows)

    crops_used = sorted({c for c in db.scalars(select(ProductionEstimate.crop).where(ProductionEstimate.user_id == uid))} |
                        {c for c in db.scalars(select(CropProductionRecord.crop).where(CropProductionRecord.user_id == uid))})
    commodities_used = sorted(set(db.scalars(select(PriceEstimate.commodity).where(PriceEstimate.user_id == uid))))

    last_irr = _latest(db, IrrigationRecord, uid)
    last_leaf = _latest(db, LeafPrediction, uid)
    last_crop = _latest(db, CropRecommendation, uid)
    return {
        "profile": profile_out(db.get(FarmerProfile, uid)),
        "filters": {"range": range or "all", "crop": production_crop, "commodity": price_commodity,
                    "crops": crops_used, "commodities": commodities_used},
        "production": {"latest_estimate": estimate_out(est) if est else None,
                       "latest_record": production_out(rec) if rec else None,
                       "series": production_series},
        "irrigation": {"latest": irrigation_out(last_irr) if last_irr else None,
                       "counts": {k: counts.get(k, 0) for k in ("Low", "Medium", "High")},
                       "series": [{"date": iso(r.created_at), "moisture": r.soil_moisture_pct,
                                   "source": r.soil_moisture_source, "need": r.need, "crop": r.crop}
                                  for r in irrigation_rows[-30:]]},
        "leaf": {"latest": leaf_out(last_leaf) if last_leaf else None},
        "price": {"latest": price_out(last_price) if last_price else None, "series": price_series,
                  "series_kind": "Your saved model estimates — not observed mandi prices"},
        "crop": {"latest": crop_out(last_crop) if last_crop else None},
    }


def activity_out(a: UserActivity):
    return {"id": a.id, "kind": a.kind, "title": a.title, "detail": a.detail, "link": a.link,
            "created_at": iso(a.created_at)}


@router.get("/activity")
def recent_activity(page: Page = Depends(), kind: str | None = Query(None, max_length=20),
                    user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    return paginate(db, UserActivity, user.id, page, activity_out, UserActivity.kind == kind if kind else None)
