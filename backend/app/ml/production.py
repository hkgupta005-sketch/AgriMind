"""Crop production (yield) estimate — wraps predict_production() from the AgriMind project."""

from datetime import date

from . import loader
from .resolve import PRODUCTION_NAMES, STATE_SHORT, must

SEASON_INFO = {
    "Kharif": "Monsoon crop, sown June–July",
    "Rabi": "Winter crop, sown October–November",
    "Summer": "Summer crop, sown March–April",
    "Winter": "Winter season crop",
    "Autumn": "Autumn season crop",
    "Whole Year": "Grown through the year (e.g. sugarcane, banana)",
}
UNIT_NOTE = "Tonnes for most crops; coconut is counted in nuts and cotton in bales."
ACCURACY = ("Estimate based on district averages, usually within ±30 %. Your own field may do "
            "better or worse depending on seed, irrigation and fertiliser.")


def _opts():
    return loader.require("production").options


def options(state=None, district=None):
    o = _opts()
    out = {"states": sorted(o["districts"]),
           "seasons": [{"value": s, "help": SEASON_INFO.get(s, "")}
                       for s in sorted(o["seasons"], key=lambda x: list(SEASON_INFO).index(x) if x in SEASON_INFO else 99)],
           "year_min": o["year_min"], "year_max": o["year_max"]}
    if state:
        st = must(state, o["districts"].keys(), "State", STATE_SHORT)
        out["state"] = st
        out["districts"] = sorted(o["districts"][st])
    if district:
        dist = must(district, out.get("districts") or o["crops"].keys(), "District")
        out["district"] = dist
        out["crops"] = sorted(o["crops"].get(dist, []))
    return out


def predict(state, district, season, crop, year, area_ha):
    m = loader.require("production")
    o = m.options
    state = must(state, o["districts"].keys(), "State", STATE_SHORT)
    district = must(district, o["districts"][state], "District")
    crop = must(crop, o["crops"][district], "Crop", PRODUCTION_NAMES)
    season = must(season, o["seasons"], "Season")
    r = m.predict_production(state=state, district=district, season=season, crop=crop,
                             year=int(year), area=float(area_ha))
    return {**r, "unit_note": UNIT_NOTE, "accuracy_note": ACCURACY,
            "context": f"Based on the district average for {crop} in {season}."}


def district_history(state, district, crop, season=None):
    """Real yearly yield from crop_production.csv (dataset, not a prediction)."""
    df = loader.csv("crop_production.csv")
    if df is None:
        return None
    sub = df[(df["State_Name"].str.lower() == state.lower()) &
             (df["District_Name"].str.lower() == district.lower()) &
             (df["Crop"].str.lower() == crop.lower())]
    if season:
        sub = sub[sub["Season"].str.lower() == season.lower()]
    sub = sub.dropna(subset=["Area", "Production"])
    sub = sub[sub["Area"] > 0]
    if sub.empty:
        return []
    yearly = sub.groupby("Crop_Year")[["Area", "Production"]].sum()
    yearly["yield"] = yearly["Production"] / yearly["Area"]
    return [{"year": int(y), "area_ha": round(float(r.Area), 1), "production_t": round(float(r.Production), 1),
             "yield_t_per_ha": round(float(r["yield"]), 3)} for y, r in yearly.iterrows()]


def guide():
    try:
        o = _opts()
        yr = f"Data covers {o['year_min']}–{o['year_max']}; later years use the latest known pattern."
        available = True
    except Exception:
        yr, available = "", False
    return {
        "tool": "production",
        "available": available,
        "question": "How much will my crop produce?",
        "output": "Expected yield (tonnes per hectare) and total production for your field",
        "time": "Under 1 minute",
        "accuracy": ACCURACY,
        "fields": [
            {"key": "state", "name": "State", "required": True, "unit": None, "example": "Uttar Pradesh",
             "where": "Where your farm is. Short forms like UP are accepted."},
            {"key": "district", "name": "District", "required": True, "unit": None, "example": "Deoria",
             "where": "Listed after you choose the state."},
            {"key": "crop", "name": "Crop", "required": True, "unit": None, "example": "Rice",
             "where": "Only crops grown in that district are listed."},
            {"key": "season", "name": "Season", "required": True, "unit": None, "example": "Kharif",
             "where": "Kharif = sown June–July, Rabi = sown Oct–Nov."},
            {"key": "year", "name": "Crop year", "required": True, "unit": "year",
             "example": str(date.today().year), "where": yr},
            {"key": "area", "name": "Field area", "required": True, "unit": "hectares (acres accepted)",
             "example": "2.5", "where": "Your land papers, or your best estimate. 1 ha = 2.471 acres."},
        ],
        "example": {"state": "Uttar Pradesh", "district": "DEORIA", "crop": "Rice", "season": "Kharif",
                    "year": date.today().year, "area": 2.0, "area_unit": "ha"},
    }
