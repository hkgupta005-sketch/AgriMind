"""Best-crop recommendation — wraps recommend_crop() from the AgriMind project.
Skipped Soil Health Card values are filled with the dataset median and listed as assumed."""

from . import loader

SOIL_KEYS = ["N", "P", "K", "ph"]
LABELS = {"N": "Nitrogen (N)", "P": "Phosphorus (P)", "K": "Potassium (K)", "ph": "Soil pH",
          "temperature": "Temperature (°C)", "humidity": "Humidity (%)", "rainfall": "Rainfall (mm)"}
RAIN_PRESETS = {"low": 0.2, "medium": 0.5, "high": 0.8}  # quantiles of rainfall in crop_rec.csv
ACCURACY = ("Accuracy on test data ≈ 99.5 % on a clean dataset; real conditions may differ. "
            "The model only chooses among its 22 crops and does not use location or season.")


def _m():
    return loader.require("crop")


def crops():
    m = _m()
    return sorted(str(c) for c in m.model.classes_)


def median(key):
    df = loader.csv("crop_rec.csv")
    if df is not None:
        return round(float(df[key].median()), 1)
    lo, hi = _m().ranges[key]
    return round((lo + hi) / 2, 1)


def rain_preset(name):
    df = loader.csv("crop_rec.csv")
    q = RAIN_PRESETS[name]
    if df is not None:
        return round(float(df["rainfall"].quantile(q)), 1)
    lo, hi = _m().ranges["rainfall"]
    return round(lo + (hi - lo) * q, 1)


def options():
    m = _m()
    return {"crops": crops(), "ranges": {k: [round(v[0], 1), round(v[1], 1)] for k, v in m.ranges.items()},
            "medians": {k: median(k) for k in m.num_features},
            "rain_presets": {k: rain_preset(k) for k in RAIN_PRESETS}}


def predict(values: dict):
    m = _m()
    inputs, assumed = {}, []
    for key in m.num_features:
        v = values.get(key)
        if v is None:
            v = median(key)
            assumed.append({"field": key, "label": LABELS[key], "value": v})
        inputs[key] = float(v)
    r = m.recommend_crop(**inputs)
    warnings = list(r["warnings"])
    if sum(1 for a in assumed if a["field"] in SOIL_KEYS) >= 3:
        warnings.append("Most soil values were assumed, so this recommendation is general. "
                        "A soil test would make it more accurate.")
    return {"crop": r["crop"], "confidence": r["confidence"],
            "top": [{"crop": c, "match": p} for c, p in r["top"]],
            "warnings": warnings, "inputs": inputs, "assumed": assumed, "accuracy_note": ACCURACY,
            "low_confidence": r["confidence"] < 50}


def guide():
    try:
        m = _m()
        r = m.ranges
        available = True
        supported = crops()
    except Exception:
        r, available, supported = {}, False, []

    def data(key, unit=""):
        return f"data {r[key][0]:.0f}–{r[key][1]:.0f}{unit}" if key in r else ""

    return {
        "tool": "crop", "available": available,
        "question": "Which crop should I grow on my land?",
        "output": "The best-matching crop with a % match, and the top 3 crops",
        "time": "About 1 minute", "accuracy": ACCURACY, "supported_crops": supported,
        "fields": [
            {"key": "N", "name": "Nitrogen (N)", "required": False, "unit": "soil test value",
             "example": "90", "where": f"Soil Health Card ({data('N')})", "skip": "I don't have the card → dataset median"},
            {"key": "P", "name": "Phosphorus (P)", "required": False, "unit": "soil test value",
             "example": "42", "where": f"Soil Health Card ({data('P')})", "skip": "I don't have the card → dataset median"},
            {"key": "K", "name": "Potassium (K)", "required": False, "unit": "soil test value",
             "example": "43", "where": f"Soil Health Card ({data('K')})", "skip": "I don't have the card → dataset median"},
            {"key": "ph", "name": "Soil pH", "required": False, "unit": "0–14", "example": "6.5",
             "where": "Soil Health Card", "skip": "I don't have the card → dataset median"},
            {"key": "temperature", "name": "Temperature", "required": True, "unit": "°C", "example": "25",
             "where": "Weather app — average for the growing season"},
            {"key": "humidity", "name": "Humidity", "required": True, "unit": "%", "example": "80",
             "where": "Weather app"},
            {"key": "rainfall", "name": "Rainfall", "required": True, "unit": "mm", "example": "200",
             "where": "Average rainfall for the season — or pick Low / Medium / High"},
        ],
        "example": {"N": 90, "P": 42, "K": 43, "ph": 6.5, "temperature": 21, "humidity": 82, "rainfall": 203},
    }
