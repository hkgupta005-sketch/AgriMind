"""Pre-irrigation check — wraps predict_irrigation() from the AgriMind project.

Farmers answer 8 plain questions. Plain answers become numbers using the dataset's own levels:
an answer maps to a quantile of that column in irrigation_prediction.csv, e.g. soil feel
"Dry" = the 30th-percentile Soil_Moisture in the training data. (Same mapping as the
command-line version of predict_irrigation.py.) Every model field the farmer does not give
is filled with the dataset's typical value (median / most common) and reported back.
"""

from . import loader
from .resolve import must

FIELDS = ['Soil_Type', 'Soil_pH', 'Soil_Moisture', 'Organic_Carbon', 'Electrical_Conductivity',
          'Temperature_C', 'Humidity', 'Rainfall_mm', 'Sunlight_Hours', 'Wind_Speed_kmh', 'Crop_Type',
          'Crop_Growth_Stage', 'Season', 'Irrigation_Type', 'Water_Source', 'Field_Area_hectare',
          'Mulching_Used', 'Previous_Irrigation_mm', 'Region']

# plain answer -> quantile of the matching dataset column
LEVELS = {
    "soil_feel": ("Soil_Moisture", {"very_dry": 0.1, "dry": 0.3, "slightly_moist": 0.5, "moist": 0.7, "wet": 0.9}),
    "rain": ("Rainfall_mm", {"very_little": 0.1, "below_normal": 0.3, "normal": 0.5, "good": 0.7, "heavy": 0.9}),
    "wind": ("Wind_Speed_kmh", {"calm": 0.1, "light": 0.3, "breezy": 0.5, "windy": 0.9}),
    "humidity": ("Humidity", {"dry": 0.1, "normal": 0.5, "humid": 0.9}),
    "previous_water": ("Previous_Irrigation_mm", {"very_little": 0.1, "normal": 0.5, "a_lot": 0.9}),
}

STATE_REGION = {
    "North": ["punjab", "haryana", "himachal pradesh", "jammu and kashmir", "ladakh", "uttarakhand",
              "uttar pradesh", "delhi", "chandigarh"],
    "East": ["bihar", "jharkhand", "west bengal", "odisha", "assam", "sikkim", "arunachal pradesh",
             "nagaland", "manipur", "mizoram", "tripura", "meghalaya", "andaman and nicobar islands"],
    "West": ["rajasthan", "gujarat", "maharashtra", "goa", "dadra and nagar haveli", "daman and diu"],
    "South": ["karnataka", "kerala", "tamil nadu", "andhra pradesh", "telangana", "puducherry", "lakshadweep"],
    "Central": ["madhya pradesh", "chhattisgarh"],
}

LABELS = {
    'Soil_Type': "Soil type", 'Soil_pH': "Soil pH", 'Soil_Moisture': "Soil moisture (%)",
    'Organic_Carbon': "Organic carbon (%)", 'Electrical_Conductivity': "Electrical conductivity (dS/m)",
    'Temperature_C': "Temperature (°C)", 'Humidity': "Air humidity (%)", 'Rainfall_mm': "Rainfall (mm)",
    'Sunlight_Hours': "Sunshine (hours/day)", 'Wind_Speed_kmh': "Wind speed (km/h)", 'Crop_Type': "Crop",
    'Crop_Growth_Stage': "Growth stage", 'Season': "Season", 'Irrigation_Type': "How you water",
    'Water_Source': "Water source", 'Field_Area_hectare': "Field size (ha)", 'Mulching_Used': "Mulch",
    'Previous_Irrigation_mm': "Water given last time (mm)", 'Region': "Region",
}

ACCURACY = ("Accuracy on test data is about 99.6 %, but the training data is clean and partly "
            "synthetic. Real fields can differ, so also look at your crop and soil.")


def _data():
    return loader.csv("irrigation_prediction.csv")


def level(col, q):
    m = loader.require("irrigation")
    df = _data()
    if df is not None:
        return round(float(df[col].quantile(q)), 2)
    lo, hi = m.ranges[col]
    return round(lo + (hi - lo) * q, 2)


def typical(col):
    m = loader.require("irrigation")
    df = _data()
    if col in m.cat_features:
        return str(df[col].mode()[0]).strip().title() if df is not None else m.choices[col][0]
    return level(col, 0.5)


def region_for_state(state):
    s = (state or "").strip().lower()
    for region, states in STATE_REGION.items():
        if s in states:
            return region
    return None


def options():
    m = loader.require("irrigation")
    levels = {k: {"column": col, "values": {ans: level(col, q) for ans, q in qs.items()}}
              for k, (col, qs) in LEVELS.items()}
    return {"choices": m.choices, "ranges": {k: list(v) for k, v in m.ranges.items()}, "levels": levels,
            "states": sorted(s.title() for states in STATE_REGION.values() for s in states)}


def predict(q: dict):
    """q = quick answers + optional details (see schemas.IrrigationQuick)."""
    m = loader.require("irrigation")
    field, assumed = {}, []

    field['Crop_Type'] = must(q["crop"], m.choices['Crop_Type'], "Crop")
    field['Crop_Growth_Stage'] = must(q["growth_stage"], m.choices['Crop_Growth_Stage'], "Growth stage")
    field['Season'] = must(q["season"], m.choices['Season'], "Season")

    if q.get("soil_moisture_pct") is not None:
        field['Soil_Moisture'] = float(q["soil_moisture_pct"])
        moisture_source = "meter"
    else:
        field['Soil_Moisture'] = level('Soil_Moisture', LEVELS["soil_feel"][1][q["soil_feel"]])
        moisture_source = "description"
    field['Temperature_C'] = float(q["temperature_c"])
    field['Rainfall_mm'] = level('Rainfall_mm', LEVELS["rain"][1][q["rain"]])
    field['Wind_Speed_kmh'] = level('Wind_Speed_kmh', LEVELS["wind"][1][q["wind"]])
    field['Mulching_Used'] = "Yes" if q["mulch"] else "No"

    d = q.get("details") or {}
    if d.get("state"):
        region = region_for_state(d["state"])
        if region:
            field['Region'] = region
    if d.get("soil_type"):
        field['Soil_Type'] = must(d["soil_type"], m.choices['Soil_Type'], "Soil type")
    if d.get("irrigation_type"):
        field['Irrigation_Type'] = must(d["irrigation_type"], m.choices['Irrigation_Type'], "Irrigation type")
    if d.get("water_source"):
        field['Water_Source'] = must(d["water_source"], m.choices['Water_Source'], "Water source")
    if d.get("humidity"):
        field['Humidity'] = level('Humidity', LEVELS["humidity"][1][d["humidity"]])
    if d.get("previous_water"):
        field['Previous_Irrigation_mm'] = level('Previous_Irrigation_mm', LEVELS["previous_water"][1][d["previous_water"]])
    for key, col in (("sunlight_hours", 'Sunlight_Hours'), ("field_area_ha", 'Field_Area_hectare'),
                     ("soil_ph", 'Soil_pH'), ("organic_carbon", 'Organic_Carbon'),
                     ("ec", 'Electrical_Conductivity')):
        if d.get(key) is not None:
            field[col] = float(d[key])

    for col in FIELDS:
        if col not in field:
            field[col] = typical(col)
            assumed.append({"field": col, "label": LABELS[col], "value": field[col]})

    r = m.predict_irrigation(**dict(field))
    return {
        "need": r["need"], "advice": r["advice"],
        "warnings": [_friendly_warning(w) for w in r["warnings"]],
        "assumed": assumed, "used": {LABELS[k]: v for k, v in field.items()},
        "soil_moisture_pct": field['Soil_Moisture'], "soil_moisture_source": moisture_source,
        "accuracy_note": ACCURACY,
    }


def _friendly_warning(w):
    for col, label in LABELS.items():
        if w.startswith(col + " "):
            return label + w[len(col):] + " — the result is less reliable."
    return w


def guide():
    try:
        m = loader.require("irrigation")
        r = m.ranges
        available = True
    except Exception:
        r, available = {}, False

    def rng(col, unit=""):
        return f"Data covers {r[col][0]:g}–{r[col][1]:g}{unit}" if col in r else None

    return {
        "tool": "irrigation", "available": available,
        "question": "Does my field need water today?",
        "output": "Irrigation need: Low / Medium / High, with advice",
        "time": "About 1 minute (2 more for the optional details)",
        "accuracy": ACCURACY,
        "fields": [
            {"key": "crop", "name": "Crop", "required": True, "example": "Wheat",
             "where": "The crop now in the field (Cotton, Maize, Potato, Rice, Sugarcane, Wheat)."},
            {"key": "growth_stage", "name": "Growth stage", "required": True, "example": "Vegetative",
             "where": "Look at the plants: just planted, leaves growing, flowering or ready to cut."},
            {"key": "season", "name": "Season", "required": True, "example": "Rabi",
             "where": "Kharif (June–July), Rabi (Oct–Nov), Zaid (March–April)."},
            {"key": "soil_feel", "name": "Soil feel", "required": True, "example": "Dry",
             "where": "Pick up soil from 5–10 cm deep and feel it — or type a moisture-meter %."},
            {"key": "temperature_c", "name": "Today's temperature", "required": True, "unit": "°C",
             "example": "35", "where": "Weather app on your phone. " + (rng('Temperature_C', ' °C') or "")},
            {"key": "rain", "name": "Rain this season", "required": True, "example": "Below normal",
             "where": "Your own experience of this season."},
            {"key": "wind", "name": "Wind", "required": True, "example": "Light breeze",
             "where": "Look at leaves and branches."},
            {"key": "mulch", "name": "Mulch on soil?", "required": True, "example": "No",
             "where": "Straw, dry leaves or a plastic sheet spread on the soil."},
            {"key": "details", "name": "More details (soil, water, Soil Health Card)", "required": False,
             "example": "Loamy soil, borewell", "skip": "Skip → typical values from our data are used and listed in the result."},
        ],
        "example": {"crop": "Wheat", "growth_stage": "Vegetative", "season": "Rabi", "soil_feel": "dry",
                    "temperature_c": 32, "rain": "below_normal", "wind": "light", "mulch": False},
    }
