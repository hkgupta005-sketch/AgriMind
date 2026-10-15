import importlib.util
import json
import os
import sys
import threading
import time
from pathlib import Path

import pandas as pd

import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"       # hide TensorFlow info/warning logs
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"      # hide the oneDNN message

import warnings
warnings.filterwarnings("ignore", category=FutureWarning)   # hide the Python 3.10 notice

import logging
logging.getLogger("tensorflow").setLevel(logging.ERROR)    # hide 'GPU not available' warning

BASE_DIR = Path(__file__).resolve().parent
os.chdir(BASE_DIR)                    # model files are loaded with relative paths
sys.path.insert(0, str(BASE_DIR))

# Models to try, in order. If one is overloaded (error 503), the next one is used.
MODELS = ["gemini-3.5-flash-lite"]   # run find_fastest_model.py to pick the best
THINKING_LEVEL = "minimal"            # fastest. If a model doesn't support it, "low" is used automatically
PRELOAD_DISEASE_MODEL = True          # load TensorFlow at startup so the first leaf check is fast
MAX_TOOL_ROUNDS = 8                   # safety limit per user message
MAX_LIST = 60                         # max items returned in a list (keeps replies small)


# ============================================================
# Helpers: load your predict_*.py files and CSVs only when needed
# ============================================================
_modules = {}
_frames = {}
_load_lock = threading.RLock()        # background preload and a question never load the same file twice


def load_module(key, *filenames):
    """Import a .py file by path (works even if the file name has spaces)."""
    with _load_lock:
        return _load_module(key, filenames)


def _load_module(key, filenames):
    if key in _modules:
        return _modules[key]
    for name in filenames:
        path = BASE_DIR / name
        if path.exists():
            spec = importlib.util.spec_from_file_location(key, path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            _modules[key] = module
            return module
    raise FileNotFoundError(f"None of these files were found: {filenames}")


def load_csv(name):
    with _load_lock:
        return _load_csv(name)


def _load_csv(name):
    if name not in _frames:
        path = BASE_DIR / name
        if not path.exists():
            raise FileNotFoundError(f"{name} not found in {BASE_DIR}")
        df = pd.read_csv(path)
        df.columns = df.columns.str.strip()
        for col in df.select_dtypes(include="object").columns:
            df[col] = df[col].astype(str).str.strip()
        _frames[name] = df
    return _frames[name]


def match(df, col, value):
    """Case-insensitive exact match on a text column."""
    return df[df[col].str.lower() == str(value).strip().lower()]


def to_jsonable(obj):
    """Convert numpy/pandas values so json.dumps never fails."""
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if hasattr(obj, "item"):          # numpy scalar
        return obj.item()
    return obj


# ============================================================
# Tools 1-5: your trained models
# ============================================================
def predict_crop_production(state, district, season, crop, year, area):
    m = load_module("production", "predict_production.py", "python predict_production.py")
    result = m.predict_production(state=state, district=district, season=season,
                                  crop=crop, year=int(year), area=float(area))
    if not isinstance(result, dict):          # older version returned only a number
        result = {"production": result}
    result["unit"] = "tonnes for most crops (coconut in nuts, cotton in bales)"
    result["accuracy_note"] = ("Estimate based on district average yield (1997-2014 data); "
                               "usually within about ±30%.")
    return result


def recommend_crop(N, P, K, temperature, humidity, ph, rainfall):
    m = load_module("crop", "predict_crop.py")
    return m.recommend_crop(N=N, P=P, K=K, temperature=temperature,
                            humidity=humidity, ph=ph, rainfall=rainfall)


def predict_market_price(state, district, market, commodity, variety="Other", grade="FAQ"):
    m = load_module("price", "predict_price.py")
    result = m.predict_price(state=state, district=district, market=market,
                             commodity=commodity, variety=variety or "Other",
                             grade=grade or "FAQ")
    result["unit"] = "Rs per quintal (100 kg); wholesale mandi price"
    result["accuracy_note"] = "Price model is the least accurate one (often ±50%)."
    return result


IRRIGATION_FIELDS = ['Soil_Type', 'Soil_pH', 'Soil_Moisture', 'Organic_Carbon',
                     'Electrical_Conductivity', 'Temperature_C', 'Humidity', 'Rainfall_mm',
                     'Sunlight_Hours', 'Wind_Speed_kmh', 'Crop_Type', 'Crop_Growth_Stage',
                     'Season', 'Irrigation_Type', 'Water_Source', 'Field_Area_hectare',
                     'Mulching_Used', 'Previous_Irrigation_mm', 'Region']


def predict_irrigation_need(**given):
    """Missing fields are filled with typical values from the dataset (and reported)."""
    m = load_module("irrigation", "predict_irrigation.py")
    df = load_csv("irrigation_prediction.csv")

    field, assumed = {}, []
    for col in IRRIGATION_FIELDS:
        if given.get(col) not in (None, ""):
            field[col] = given[col]
        else:
            typical = df[col].median() if pd.api.types.is_numeric_dtype(df[col]) else df[col].mode()[0]
            field[col] = typical
            assumed.append(f"{col}={typical}")

    result = m.predict_irrigation(**field)
    result["assumed_typical_values"] = assumed
    return result


def clean_path(raw):
    """Fix paths as Gemini sends them: doubled backslashes, quotes, / vs \\."""
    text = str(raw).strip().strip('"').strip("'")
    while "\\\\" in text:
        text = text.replace("\\\\", "\\")
    path = Path(text.replace("\\", os.sep).replace("/", os.sep))
    if not path.is_absolute():
        path = BASE_DIR / path
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}. Ask the user for the exact path.")
    return str(path)


def detect_plant_disease(image_path):
    m = load_module("disease", "scripts/predict.py", "predict.py")
    result = m.predict_disease(clean_path(image_path))
    result["note"] = ("Model trained on PlantVillage photos (single leaf, plain background); "
                      "field photos may be less accurate.")
    result["how_to_read_top_predictions"] = (
        "Only the first class is the diagnosis. The other percentages are the model's "
        "alternative guesses (uncertainty), NOT signs or traces of those diseases on the leaf.")
    return result


# ============================================================
# Tools 6-9: look things up in your datasets
# ============================================================
def get_production_history(state, crop=None, district=None, season=None):
    df = load_csv("crop_production.csv")
    df = df.dropna(subset=["Area", "Production"])
    df = df[df["Area"] > 0]

    sub = match(df, "State_Name", state)
    if sub.empty:
        return {"error": f"State '{state}' not found",
                "valid_states": sorted(df["State_Name"].unique().tolist())}
    if district:
        sub = match(sub, "District_Name", district)
    if season:
        sub = match(sub, "Season", season)

    if not crop:                              # no crop given -> main crops of the area
        top = (sub.groupby("Crop")["Area"].sum().sort_values(ascending=False).head(15))
        return {"filters": {"state": state, "district": district, "season": season},
                "top_crops_by_total_area_hectares": top.round(0).to_dict()}

    sub = match(sub, "Crop", crop)
    if sub.empty:
        return {"error": f"No records for crop '{crop}' with these filters"}

    yearly = sub.groupby("Crop_Year")[["Area", "Production"]].sum()
    yearly["yield_t_per_ha"] = (yearly["Production"] / yearly["Area"]).round(2)
    return {
        "filters": {"state": state, "district": district, "season": season, "crop": crop},
        "average_yield_t_per_ha": round(sub["Production"].sum() / sub["Area"].sum(), 2),
        "by_year": yearly.tail(12).round(1).reset_index().to_dict(orient="records"),
        "note": "Production in tonnes for most crops; data covers roughly 1997-2015.",
    }


def get_crop_requirements(crop):
    df = load_csv("crop_rec.csv")
    df["label"] = df["label"].str.lower()
    sub = df[df["label"] == str(crop).strip().lower()]
    if sub.empty:
        return {"error": f"Crop '{crop}' not in recommendation data",
                "available_crops": sorted(df["label"].unique().tolist())}
    cols = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
    stats = sub[cols].agg(["min", "mean", "max"]).round(1)
    return {"crop": crop,
            "typical_conditions": stats.to_dict(),
            "units": {"N/P/K": "soil ratio", "temperature": "°C", "humidity": "%",
                      "ph": "0-14", "rainfall": "mm"}}


def get_market_prices(commodity, state=None, district=None):
    df = load_csv("daily_price.csv")
    sub = df[df["Commodity"].str.lower().str.contains(str(commodity).strip().lower(), regex=False)]
    if state:
        sub = match(sub, "State", state)
    if district:
        sub = match(sub, "District", district)
    if sub.empty:
        return {"error": f"No price records for '{commodity}' with these filters"}

    cols = [c for c in ["State", "District", "Market", "Commodity", "Variety",
                        "Arrival_Date", "Min Price", "Max Price", "Modal Price"] if c in sub.columns]
    rows = sub.sort_values("Modal Price")[cols].head(20)
    return {
        "records_found": int(len(sub)),
        "modal_price_summary": {
            "lowest": float(sub["Modal Price"].min()),
            "average": round(float(sub["Modal Price"].mean()), 0),
            "highest": float(sub["Modal Price"].max()),
        },
        "sample_rows": rows.to_dict(orient="records"),
        "unit": "Rs per quintal (100 kg)",
    }


def list_valid_names(kind, state=None, district=None):
    """Valid spellings the models understand."""
    if kind in ("states", "districts", "seasons", "production_crops"):
        df = load_csv("crop_production.csv")
        if kind == "states":
            values = df["State_Name"].unique()
        elif kind == "seasons":
            values = df["Season"].unique()
        elif kind == "districts":
            if not state:
                return {"error": "state is required for districts"}
            values = match(df, "State_Name", state)["District_Name"].unique()
        else:
            sub = match(df, "District_Name", district) if district else df
            values = sub["Crop"].unique()
    elif kind in ("price_states", "markets", "commodities"):
        df = load_csv("daily_price.csv")
        if kind == "price_states":
            values = df["State"].unique()
        elif kind == "markets":
            if not district:
                return {"error": "district is required for markets"}
            values = match(df, "District", district)["Market"].unique()
        else:
            values = df["Commodity"].unique()
    elif kind == "recommendation_crops":
        values = load_csv("crop_rec.csv")["label"].str.lower().unique()
    elif kind == "irrigation_options":
        df = load_csv("irrigation_prediction.csv")
        return {c: sorted(df[c].astype(str).unique().tolist())
                for c in ['Soil_Type', 'Crop_Type', 'Crop_Growth_Stage', 'Season',
                          'Irrigation_Type', 'Water_Source', 'Mulching_Used', 'Region']}
    else:
        return {"error": f"Unknown kind '{kind}'"}

    values = sorted(str(v) for v in values)
    return {"kind": kind, "count": len(values), "values": values[:MAX_LIST],
            "truncated": len(values) > MAX_LIST}


# ============================================================
# Tool declarations (what Gemini sees)
# ============================================================
def fn(name, description, properties, required):
    return {"type": "function", "name": name, "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required}}


S = {"type": "string"}
NUM = {"type": "number"}

TOOLS = [
    fn("predict_crop_production",
       "Predict expected yield (t/ha) and total production for a crop on a field in India, "
       "using the AgriMind yield model.",
       {"state": {**S, "description": "Indian state, e.g. Uttar Pradesh"},
        "district": {**S, "description": "District, e.g. AGRA"},
        "season": {**S, "description": "Kharif, Rabi, Whole Year, Summer, Winter or Autumn"},
        "crop": {**S, "description": "Crop name, e.g. Rice"},
        "year": {"type": "integer", "description": "Crop year, e.g. 2014"},
        "area": {**NUM, "description": "Field area in hectares"}},
       ["state", "district", "season", "crop", "year", "area"]),

    fn("recommend_crop",
       "Recommend the best crops for given soil nutrients and weather (top 3 with confidence).",
       {"N": {**NUM, "description": "Nitrogen (soil ratio)"},
        "P": {**NUM, "description": "Phosphorus (soil ratio)"},
        "K": {**NUM, "description": "Potassium (soil ratio)"},
        "temperature": {**NUM, "description": "°C"},
        "humidity": {**NUM, "description": "%"},
        "ph": {**NUM, "description": "Soil pH 0-14"},
        "rainfall": {**NUM, "description": "mm"}},
       ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]),

    fn("predict_market_price",
       "Predict today's wholesale mandi modal price (Rs/quintal) for a commodity at a market.",
       {"state": S, "district": S, "market": S,
        "commodity": {**S, "description": "e.g. Potato, Onion, Wheat"},
        "variety": {**S, "description": "Optional, default 'Other'"},
        "grade": {**S, "description": "Optional, default 'FAQ'"}},
       ["state", "district", "market", "commodity"]),

    fn("predict_irrigation_need",
       "Predict irrigation need (Low/Medium/High) for a field. Give as many fields as the user "
       "knows; missing ones are filled with typical values and reported back.",
       {"Soil_Type": S, "Soil_pH": NUM, "Soil_Moisture": {**NUM, "description": "%"},
        "Organic_Carbon": {**NUM, "description": "%"},
        "Electrical_Conductivity": {**NUM, "description": "dS/m"},
        "Temperature_C": NUM, "Humidity": {**NUM, "description": "%"},
        "Rainfall_mm": NUM, "Sunlight_Hours": NUM, "Wind_Speed_kmh": NUM,
        "Crop_Type": S, "Crop_Growth_Stage": S,
        "Season": {**S, "description": "Kharif, Rabi or Zaid"},
        "Irrigation_Type": S, "Water_Source": S, "Field_Area_hectare": NUM,
        "Mulching_Used": {**S, "description": "Yes or No"},
        "Previous_Irrigation_mm": NUM, "Region": S},
       ["Crop_Type", "Soil_Moisture"]),

    fn("detect_plant_disease",
       "Detect plant disease from a leaf photo saved on this computer.",
       {"image_path": {**S, "description": "Path to the leaf image file"}},
       ["image_path"]),

    fn("get_production_history",
       "Look up historical crop production and yield from the dataset for a state "
       "(optionally district / season / crop). Without crop, returns the main crops grown there.",
       {"state": S, "crop": S, "district": S, "season": S},
       ["state"]),

    fn("get_crop_requirements",
       "Typical soil N/P/K, temperature, humidity, pH and rainfall in which a crop grows "
       "(from the crop recommendation dataset).",
       {"crop": {**S, "description": "e.g. rice, maize, chickpea"}},
       ["crop"]),

    fn("get_market_prices",
       "Look up actual recorded mandi prices for a commodity (optionally by state/district).",
       {"commodity": S, "state": S, "district": S},
       ["commodity"]),

    fn("list_valid_names",
       "Get valid names/spellings the models accept. kind = states | districts (needs state) | "
       "seasons | production_crops (optional district) | price_states | markets (needs district) | "
       "commodities | recommendation_crops | irrigation_options",
       {"kind": S, "state": S, "district": S},
       ["kind"]),
]

FUNCTIONS = {
    "predict_crop_production": predict_crop_production,
    "recommend_crop": recommend_crop,
    "predict_market_price": predict_market_price,
    "predict_irrigation_need": predict_irrigation_need,
    "detect_plant_disease": detect_plant_disease,
    "get_production_history": get_production_history,
    "get_crop_requirements": get_crop_requirements,
    "get_market_prices": get_market_prices,
    "list_valid_names": list_valid_names,
}


def run_tool(name, arguments):
    """Run one tool; errors are returned to Gemini so it can fix inputs or ask the user."""
    name = name.split(":")[-1]                 # Gemini sometimes sends 'default_api:tool_name'
    if name not in FUNCTIONS:
        return {"error": f"Unknown tool {name}"}
    try:
        return to_jsonable(FUNCTIONS[name](**(arguments or {})))
    except Exception as e:                     # wrong name, missing model file, bad value...
        return {"error": f"{type(e).__name__}: {e}"}


# ============================================================
# Chatbot
# ============================================================
SYSTEM_INSTRUCTION = """You are AgriMind, a friendly farming assistant for Indian farmers and students.

How to answer:
- Reply in the same language the user writes in (English, Hindi or Hinglish).
- Keep answers SHORT: usually 3-6 sentences or a few bullet points (under ~120 words), unless the user asks for detail.
- For predictions (yield/production, best crop, mandi price, irrigation need, leaf disease) ALWAYS call the matching tool. Never invent model numbers.
- For facts from data (past production, crop soil/weather needs, recorded prices) call the lookup tools.
- If required inputs are missing, ask the user for them first (one short question). If a tool returns an error about a name, call list_valid_names and suggest the right spelling.
- Always mention units (t/ha, tonnes, Rs/quintal, mm, °C) and the accuracy note returned by the tool.
- If a tool reports assumed values or low confidence, tell the user.
- For leaf checks: the top class is the diagnosis. Never describe the smaller percentages as "traces" or "signs" of other diseases; they only show how sure the model is. If confidence is below 60%, say the result is uncertain and suggest a clearer photo.
- General agriculture questions (pests, fertilizer timing, sowing, soil care) can be answered from your own knowledge.
- For pesticides/chemicals: give general guidance only, tell the user to follow the product label and confirm doses with the local Krishi Vigyan Kendra (KVK) or agriculture officer.
- If a tool returns an "error", NEVER invent a result. Tell the user what went wrong (for example, image not found) and what to fix.
- If unsure, say so honestly."""


def make_client():
    from dotenv import load_dotenv
    from google import genai

    load_dotenv()
    api_key = os.getenv("Gemini_Api_Key") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        sys.exit("ERROR: put Gemini_Api_Key=your_key in a .env file next to this script")
    return genai.Client(api_key=api_key)


_active_model = 0          # index in MODELS that is currently working


def is_busy_error(e):
    """True for 'server overloaded / rate limited' errors, which are worth retrying."""
    text = str(e).lower()
    return any(k in text for k in ("503", "unavailable", "high demand", "429",
                                   "resource_exhausted", "overloaded",
                                   "404", "not found", "not supported for"))  # wrong/unavailable model -> try next


def call_gemini(client, current_input, previous_id, allow_switch=True):
    """One (non-streaming) call to Gemini.
    allow_switch=False keeps the same model (needed when sending tool results back,
    because the tool call and its result must stay in the same model's conversation).
    Returns (interaction_id, text, tool_calls)."""
    global _active_model, THINKING_LEVEL
    last_error = None
    models = range(_active_model, len(MODELS)) if allow_switch else [_active_model]
    tries = 1 if allow_switch else 3       # busy model on a new question -> skip at once

    for i in models:
        attempt = 0
        while attempt < tries:
            try:
                interaction = client.interactions.create(
                    model=MODELS[i],
                    system_instruction=SYSTEM_INSTRUCTION,
                    input=current_input,
                    tools=TOOLS,
                    previous_interaction_id=previous_id,
                    generation_config={"thinking_level": THINKING_LEVEL},
                )
                calls = [{"id": st.id, "name": st.name, "args": st.arguments or {}}
                         for st in interaction.steps if st.type == "function_call"]
                if i != _active_model:
                    print(f"  (switched to {MODELS[i]} because the previous model was busy)")
                    _active_model = i
                text = "" if calls else (interaction.output_text or "")
                return interaction.id, text, calls

            except Exception as e:
                msg = str(e).lower()
                if "thinking" in msg and THINKING_LEVEL != "low":
                    THINKING_LEVEL = "low"            # model doesn't support 'minimal'
                    continue                          # retry without counting an attempt
                if not is_busy_error(e):
                    raise
                last_error = e
                attempt += 1
                time.sleep(1.5 * attempt)

    raise RuntimeError(f"All Gemini models are busy right now, please try again in a minute. "
                       f"Last error: {last_error}")


_answer_cache = {}          # same question asked again -> instant answer


def ask(client, user_message, previous_id):
    """Send one user message, run any tools Gemini asks for, return (reply, interaction_id).
    The reply is printed when ready."""
    key = user_message.strip().lower()
    if key in _answer_cache:
        print(f"\nAgriMind: {_answer_cache[key]}")
        return _answer_cache[key], previous_id

    conversation_before = previous_id          # used for recovery if a tool round fails
    current_input = user_message
    collected = []                             # all tool results of this message
    allow_switch = True

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            new_id, text, calls = call_gemini(client, current_input, previous_id, allow_switch)
        except Exception as e:
            if not collected:
                raise
            # Tool results could not be attached to the tool call (e.g. server lost the turn).
            # Recover: ask again from the previous conversation, giving the data as plain text.
            print(f"  (recovering after: {str(e)[:80]}...)")
            recovery_input = (f"{user_message}\n\n[Data already fetched from AgriMind tools - "
                              f"use it to answer, do not call tools again]\n"
                              + json.dumps(collected, default=str)[:15000])
            new_id, text, calls = call_gemini(client, recovery_input, conversation_before)
            print(f"\nAgriMind: {text}")
            return text, new_id

        if not new_id:
            raise RuntimeError("Gemini did not return an interaction id")
        previous_id = new_id

        if not calls:                                  # no tools needed -> answer is done
            print(f"\nAgriMind: {text}")
            if collected:                              # cache data answers (not chit-chat)
                _answer_cache[key] = text
            return text, previous_id

        function_results = []
        for call in calls:
            args = call["args"]
            result = run_tool(call["name"], args)
            print(f"  [tool] {call['name']}({args})")
            collected.append({"tool": call["name"], "arguments": args, "result": result})
            function_results.append({
                "type": "function_result",
                "name": call["name"],
                "call_id": call["id"],
                "result": [{"type": "text", "text": json.dumps(result, default=str)}],
            })
        current_input = function_results               # send tool results back to Gemini
        allow_switch = False                            # same model must receive the results

    return "Sorry, that took too many steps. Please ask in a simpler way.", previous_id


def preload():
    """Load CSVs and ML models in the background so the first questions are fast."""
    jobs = [
        lambda: load_csv("crop_production.csv"),
        lambda: load_csv("crop_rec.csv"),
        lambda: load_csv("daily_price.csv"),
        lambda: load_csv("irrigation_prediction.csv"),
        lambda: load_module("production", "predict_production.py", "python predict_production.py"),
        lambda: load_module("crop", "predict_crop.py"),
        lambda: load_module("price", "predict_price.py"),
        lambda: load_module("irrigation", "predict_irrigation.py"),
    ]
    if PRELOAD_DISEASE_MODEL:                # slowest one last, so the others are ready first
        jobs.append(lambda: load_module("disease", "scripts/predict.py", "predict.py")
                    .load_model_and_classes())
    for job in jobs:
        try:
            job()
        except Exception:
            pass                             # a missing file only matters when that tool is used


def main():
    client = make_client()
    threading.Thread(target=preload, daemon=True).start()
    print("🌾 AgriMind Chatbot (type 'exit' to quit, 'new' to start a new chat)\n")
    previous_id = None                       # remembers the conversation

    while True:
        try:
            user_message = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not user_message:
            continue
        if user_message.lower() in ("exit", "quit", "bye"):
            break
        if user_message.lower() == "new":
            previous_id = None
            print("(new conversation)\n")
            continue

        try:
            print("AgriMind is thinking...", end="", flush=True)
            start = time.time()
            reply, previous_id = ask(client, user_message, previous_id)
            print(f"   ({time.time() - start:.1f} s)\n")
        except Exception as e:
            print(f"\n[error talking to Gemini] {e}\n")

    print("Bye! 🌱")


if __name__ == "__main__":
    main()