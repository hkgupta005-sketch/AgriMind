"""
AgriMind API (FastAPI)
----------------------
One program that connects all your AgriMind models.

Run (from the AgriMind folder):
    python main.py
Then open  http://127.0.0.1:8000/docs  in your browser.
Pick any endpoint -> "Try it out" -> enter your details -> "Execute".

No database is used: results are returned, not saved.
"""

import importlib.util
import os
import sys
import tempfile
from pathlib import Path
from typing import List, Literal, Optional

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")    # quieter TensorFlow

# chatbot.py prints replies; the Windows console can't print "₹" without this
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
os.chdir(BASE_DIR)                     # your predict_*.py files load .pkl files by relative path
sys.path.insert(0, str(BASE_DIR))

app = FastAPI(
    title="AgriMind API",
    description="Crop yield, best crop, mandi price, irrigation need, leaf disease check and chatbot.",
    version="1.0",
)

# the AgriMind website (npm run dev) calls this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ============================================================
# Load your existing predict files (only once, when first needed)
# ============================================================
_modules = {}


def load_module(key, *filenames):
    """Import a .py file by its path (works with spaces in the file name)."""
    if key not in _modules:
        for name in filenames:
            path = BASE_DIR / name
            if path.exists():
                spec = importlib.util.spec_from_file_location(f"agri_{key}", path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                _modules[key] = module
                break
        else:
            raise FileNotFoundError(f"File not found: {' or '.join(filenames)}")
    return _modules[key]


MODEL_FILES = {
    "yield": ("predict_production.py", "python predict_production.py"),
    "crop": ("predict_crop.py",),
    "price": ("predict_price.py",),
    "irrigation": ("predict_irrigation.py",),
    "disease": ("scripts/predict.py", "predict.py"),
    "chatbot": ("chatbot.py",),
}


def model(key):
    """Load a model file, or answer with a clear error if it's missing."""
    try:
        return load_module(key, *MODEL_FILES[key])
    except FileNotFoundError as e:
        raise HTTPException(503, f"{e}. Put it in the AgriMind folder (and run its training script).")


def run(function, **kwargs):
    """Call a predict function. Wrong names/values become a 400 error with the reason."""
    try:
        return function(**kwargs)
    except (ValueError, KeyError) as e:
        raise HTTPException(400, str(e).strip("'\""))


# ============================================================
# What the user enters (shown as forms in /docs)
# ============================================================
class YieldInput(BaseModel):
    state: str = Field(examples=["Uttar Pradesh"])
    district: str = Field(examples=["DEORIA"])
    season: str = Field(examples=["Kharif"], description="Kharif, Rabi, Whole Year, Summer, Winter or Autumn")
    crop: str = Field(examples=["Rice"])
    year: int = Field(examples=[2014], ge=1990, le=2050)
    area: float = Field(examples=[2.0], gt=0, description="Field area in hectares")


class CropInput(BaseModel):
    N: float = Field(examples=[90], ge=0, description="Nitrogen (soil test ratio)")
    P: float = Field(examples=[42], ge=0, description="Phosphorus")
    K: float = Field(examples=[43], ge=0, description="Potassium")
    temperature: float = Field(examples=[20.8], description="°C")
    humidity: float = Field(examples=[82], ge=0, le=100, description="%")
    ph: float = Field(examples=[6.5], ge=0, le=14)
    rainfall: float = Field(examples=[202.9], ge=0, description="mm")


class PriceInput(BaseModel):
    state: str = Field(examples=["Uttar Pradesh"])
    district: str = Field(examples=["Aligarh"])
    market: str = Field(examples=["Aligarh"])
    commodity: str = Field(examples=["Potato"])
    variety: str = Field("Other", examples=["Other"])
    grade: str = Field("FAQ", examples=["FAQ"])


class IrrigationInput(BaseModel):
    """Give what you know. Anything left out is filled with a typical value from the dataset."""
    Crop_Type: str = Field(examples=["Rice"])
    Soil_Moisture: float = Field(examples=[15], ge=0, le=100, description="%")
    Temperature_C: Optional[float] = Field(None, examples=[38])
    Crop_Growth_Stage: Optional[str] = Field(None, examples=["Flowering"])
    Season: Optional[str] = Field(None, examples=["Zaid"], description="Kharif, Rabi or Zaid")
    Region: Optional[str] = Field(None, examples=["West"])
    Soil_Type: Optional[str] = Field(None, examples=["Sandy"])
    Soil_pH: Optional[float] = None
    Organic_Carbon: Optional[float] = None
    Electrical_Conductivity: Optional[float] = None
    Humidity: Optional[float] = None
    Rainfall_mm: Optional[float] = None
    Sunlight_Hours: Optional[float] = None
    Wind_Speed_kmh: Optional[float] = None
    Field_Area_hectare: Optional[float] = None
    Irrigation_Type: Optional[str] = None
    Water_Source: Optional[str] = None
    Mulching_Used: Optional[str] = Field(None, examples=["No"])
    Previous_Irrigation_mm: Optional[float] = None


class ChatInput(BaseModel):
    message: str = Field(examples=["Which crops grow best in Punjab?"])
    conversation_id: Optional[str] = Field(
        None, description="Leave empty for a new chat. Send back the id you got to continue it.")


# ============================================================
# Endpoints
# ============================================================
@app.get("/", tags=["Info"])
def home():
    return {
        "message": "AgriMind API is running. Open /docs to try every model.",
        "endpoints": {
            "POST /predict/yield": "expected yield (t/ha) and total production",
            "POST /predict/crop": "best crops for soil + weather",
            "POST /predict/price": "expected mandi price (Rs/quintal)",
            "POST /predict/irrigation": "irrigation need (Low/Medium/High)",
            "POST /predict/disease": "upload a leaf photo",
            "POST /chat": "ask the AgriMind chatbot",
            "GET /options/{tool}": "valid names for dropdowns",
        },
    }


@app.post("/predict/yield", tags=["Predict"])
def predict_yield(data: YieldInput):
    result = run(model("yield").predict_production, **data.model_dump())
    result["unit"] = "tonnes (coconut in nuts, cotton in bales)"
    result["accuracy_note"] = "District-average estimate, usually within about ±30%."
    return result


@app.post("/predict/crop", tags=["Predict"])
def predict_crop(data: CropInput):
    return run(model("crop").recommend_crop, **data.model_dump())


@app.post("/predict/price", tags=["Predict"])
def predict_price(data: PriceInput):
    result = run(model("price").predict_price, **data.model_dump())
    result["unit"] = "Rs per quintal (100 kg), wholesale mandi price"
    result["accuracy_note"] = "Often off by up to ±50%; use the range."
    return result


_irrigation_defaults = None


def irrigation_defaults():
    """Typical value for every irrigation field (median / most common in the dataset)."""
    global _irrigation_defaults
    if _irrigation_defaults is None:
        m = model("irrigation")
        try:
            df = pd.read_csv(BASE_DIR / "irrigation_prediction.csv")
            df.columns = df.columns.str.strip()
            _irrigation_defaults = {c: round(float(df[c].median()), 2) for c in m.num_features}
            _irrigation_defaults.update({c: str(df[c].mode()[0]).strip().title() for c in m.cat_features})
        except FileNotFoundError:          # no CSV: middle of the range / first option
            _irrigation_defaults = {c: round(sum(m.ranges[c]) / 2, 2) for c in m.num_features}
            _irrigation_defaults.update({c: m.choices[c][0] for c in m.cat_features})
    return _irrigation_defaults


@app.post("/predict/irrigation", tags=["Predict"])
def predict_irrigation(data: IrrigationInput):
    given = data.model_dump()
    field, assumed = {}, {}
    for key, typical in irrigation_defaults().items():
        if given.get(key) in (None, ""):
            field[key] = typical
            assumed[key] = typical
        else:
            field[key] = given[key]
    result = run(model("irrigation").predict_irrigation, **field)
    result["assumed_typical_values"] = assumed
    return result


@app.post("/predict/disease", tags=["Predict"])
async def predict_disease(photo: UploadFile = File(..., description="Leaf photo (JPG or PNG)")):
    suffix = Path(photo.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
        raise HTTPException(400, "Upload a JPG, PNG, BMP or WEBP image.")

    # save the upload to a temporary file, predict, then delete it
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await photo.read())
        tmp_path = tmp.name
    try:
        try:
            m = load_module("disease", *MODEL_FILES["disease"])
        except ImportError:
            raise HTTPException(503, "TensorFlow is not installed. Run: pip install tensorflow")
        except FileNotFoundError as e:
            raise HTTPException(503, f"{e}. Train the plant disease model first.")
        result = run(m.predict_disease, image_path=tmp_path)
    finally:
        os.remove(tmp_path)

    result["note"] = ("Only 'disease' is the diagnosis. top_predictions show how sure the model is, "
                      "not signs of other diseases.")
    return result


_chat_client = None


@app.post("/chat", tags=["Chatbot"])
def chat(data: ChatInput):
    global _chat_client
    bot = model("chatbot")
    if _chat_client is None:
        try:
            _chat_client = bot.make_client()
        except SystemExit:
            raise HTTPException(503, "Gemini_Api_Key is missing from .env")
        except ImportError:
            raise HTTPException(503, "Run: pip install google-genai python-dotenv")
    try:
        reply, conversation_id = bot.ask(_chat_client, data.message, data.conversation_id)
    except Exception as e:
        raise HTTPException(502, f"Gemini error: {e}")
    return {"reply": reply, "conversation_id": conversation_id}


@app.get("/options/{tool}", tags=["Info"])
def options(tool: Literal["yield", "price", "crop", "irrigation"],
            state: Optional[str] = None, district: Optional[str] = None):
    """Valid names the models accept. Add ?state=... or ?district=... to narrow the list."""
    if tool == "yield":
        o = model("yield").options
        if district:
            return {"crops": o["crops"].get(district.upper(), [])}
        if state:
            return {"districts": o["districts"].get(state, [])}
        return {"states": sorted(o["districts"]), "seasons": o["seasons"],
                "years": [o["year_min"], o["year_max"]]}
    if tool == "price":
        o = model("price").options
        if district:
            return {"markets": o["markets"].get(district, [])}
        if state:
            return {"districts": o["districts"].get(state, [])}
        return {"states": sorted(o["districts"]), "commodities": o["commodities"], "grades": o["grades"]}
    if tool == "crop":
        return {"value_ranges_in_data": model("crop").ranges}
    m = model("irrigation")
    return {"choices": m.choices, "value_ranges_in_data": m.ranges}


if __name__ == "__main__":
    import uvicorn
    print("Open http://127.0.0.1:8000/docs to try the models")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)