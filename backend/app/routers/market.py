from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import auth
from ..db import get_db
from ..ml import price
from ..models import PriceEstimate, User
from ..schemas import PriceIn
from ..services import activity
from .common import Page, call_model, iso, owned, paginate

router = APIRouter(prefix="/api/market", tags=["Crop price"])


def record_out(r: PriceEstimate):
    return {"id": r.id, "state": r.state, "district": r.district, "market": r.market, "commodity": r.commodity,
            "variety": r.variety, "grade": r.grade, "price_per_quintal": r.price_per_quintal,
            "range_low": r.range_low, "range_high": r.range_high, "warnings": r.warnings,
            "created_at": iso(r.created_at), "kind": "model_estimate"}


@router.post("/estimate")
async def estimate(body: PriceIn, user: User | None = Depends(auth.optional_user), db: Session = Depends(get_db)):
    r = await call_model(price.predict, body.state, body.district, body.market, body.commodity,
                         body.variety, body.grade)
    r["saved_id"] = None
    if user and body.save:
        row = PriceEstimate(user_id=user.id, state=r["state"], district=r["district"], market=r["market"],
                            commodity=r["commodity"], variety=r["variety"], grade=r["grade"],
                            price_per_quintal=r["price_per_quintal"], range_low=r["range_low"],
                            range_high=r["range_high"], warnings=r["warnings"])
        db.add(row)
        activity.log(db, user.id, "price", f"Price estimate: {r['commodity']} at {r['market']}",
                     f"≈ ₹{r['price_per_quintal']:,.0f} per quintal", "/crop-price")
        db.commit()
        r["saved_id"] = row.id
    return r


@router.get("/prices")
async def prices(commodity: str = Query(min_length=1, max_length=120), state: str | None = None):
    """Recorded mandi prices from the dataset snapshot (no dates in the data)."""
    def run():
        com = price.options(commodity=commodity)["commodity"]
        return price.snapshot(com, state)
    r = await call_model(run)
    return r or {"commodity": commodity, "records": 0, "rows": [], "summary": None,
                 "label": "Price dataset not available."}


@router.get("/history")
def history(page: Page = Depends(), commodity: str | None = Query(None, max_length=120),
            user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    """Your saved model estimates (not observed prices)."""
    extra = PriceEstimate.commodity == commodity if commodity else None
    return paginate(db, PriceEstimate, user.id, page, record_out, extra)


@router.delete("/history/{record_id}")
def delete(record_id: int, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, PriceEstimate, record_id, user.id))
    db.commit()
    return {"ok": True}
