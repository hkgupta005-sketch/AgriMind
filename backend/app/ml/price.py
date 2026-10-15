"""Mandi price estimate — wraps predict_price() from the AgriMind project.

daily_price.csv is a single day's snapshot without a date column, so there is no real price
history or trend here; the snapshot table is labelled as such.
"""

from . import loader
from .resolve import MANDI_NAMES, STATE_SHORT, must

GRADES = {"FAQ": "Normal, average quality (most common)", "Large": "Big size, top quality",
          "Medium": "Medium size", "Small": "Small size"}
ACCURACY = "Test R² ≈ 0.73 — often off by up to ±50 %, so always look at the range."
LABEL = "Wholesale mandi price estimate — not the shop price and not today's live price."


def _o():
    return loader.require("price").options


def options(state=None, district=None, market=None, commodity=None):
    o = _o()
    out = {"states": sorted(o["districts"]), "commodities": sorted(o["commodities"]),
           "grades": [{"value": g, "help": GRADES.get(g, "")} for g in o["grades"]]}
    if state:
        st = must(state, o["districts"].keys(), "State", STATE_SHORT)
        out["state"] = st
        out["districts"] = sorted(o["districts"][st])
    if district:
        dist = must(district, out.get("districts") or o["markets"].keys(), "District")
        out["district"] = dist
        out["markets"] = sorted(o["markets"].get(dist, []))
    if market:
        out["market_commodities"] = sorted(o["market_commodities"].get(market, []))
    if commodity:
        com = must(commodity, o["commodities"], "Crop", MANDI_NAMES)
        out["commodity"] = com
        out["varieties"] = sorted(o["varieties"].get(com, ["Other"]))
    return out


def predict(state, district, market, commodity, variety=None, grade=None):
    m = loader.require("price")
    o = m.options
    state = must(state, o["districts"].keys(), "State", STATE_SHORT)
    district = must(district, o["districts"][state], "District")
    market = must(market, o["markets"][district], "Mandi")
    commodity = must(commodity, o["commodities"], "Crop", MANDI_NAMES)
    varieties = o["varieties"].get(commodity, ["Other"])
    if not variety:
        variety = "Other" if "Other" in varieties else varieties[0]
    r = m.predict_price(state=state, district=district, market=market, commodity=commodity,
                        variety=variety, grade=grade or "FAQ")
    return {**r, "accuracy_note": ACCURACY, "label": LABEL}


def snapshot(commodity, state=None, limit=60):
    """Recorded Min/Max/Modal prices for a commodity across mandis (dataset snapshot)."""
    df = loader.csv("daily_price.csv")
    if df is None:
        return None
    sub = df[df["Commodity"].str.lower() == commodity.lower()]
    if state:
        sub = sub[sub["State"].str.lower() == state.lower()]
    total = int(len(sub))
    sub = sub.sort_values("Modal Price")
    rows = [{"state": r.State, "district": r.District, "market": r.Market, "variety": r.Variety,
             "grade": r.Grade, "min": float(r["Min Price"]), "max": float(r["Max Price"]),
             "modal": float(r["Modal Price"])} for _, r in sub.head(limit).iterrows()]
    summary = None
    if total:
        summary = {"lowest": float(sub["Modal Price"].min()), "average": round(float(sub["Modal Price"].mean())),
                   "highest": float(sub["Modal Price"].max())}
    return {"commodity": commodity, "records": total, "rows": rows, "summary": summary,
            "label": "From the dataset snapshot — not today's live price.", "unit": "₹ per quintal"}


def guide():
    try:
        _o()
        available = True
    except Exception:
        available = False
    return {
        "tool": "price", "available": available,
        "question": "What price will my crop get at the mandi?",
        "output": "Expected modal price in ₹ per quintal and ₹ per kg, with a likely range",
        "time": "Under 1 minute", "accuracy": ACCURACY,
        "fields": [
            {"key": "state", "name": "State", "required": True, "example": "Uttar Pradesh",
             "where": "Short forms like UP are accepted."},
            {"key": "district", "name": "District", "required": True, "example": "Aligarh",
             "where": "Listed after you choose the state."},
            {"key": "market", "name": "Mandi (market)", "required": True, "example": "Aligarh",
             "where": "The mandi where you will sell. Chosen for you if the district has only one."},
            {"key": "commodity", "name": "Crop", "required": True, "example": "Potato",
             "where": "Crops sold at that mandi are listed first. Hindi names work: aloo, pyaz, gehun, dhan…"},
            {"key": "variety", "name": "Variety", "required": False, "example": "Red",
             "skip": "I don't know → Other"},
            {"key": "grade", "name": "Quality / grade", "required": False, "example": "FAQ",
             "skip": "Default FAQ = normal, average quality"},
        ],
        "example": {"state": "Uttar Pradesh", "district": "Aligarh", "market": "Aligarh",
                    "commodity": "Potato", "variety": "Other", "grade": "FAQ"},
    }
