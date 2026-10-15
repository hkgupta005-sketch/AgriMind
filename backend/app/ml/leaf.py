"""Leaf disease check — wraps predict_disease() from scripts/predict.py (38 PlantVillage classes).
Preprocessing (RGB, 224x224, no /255) stays inside predict_disease. The uploaded photo is
deleted right after prediction; only a small thumbnail is kept with the saved result."""

import base64
import io
import json
import os
import tempfile
import threading

from PIL import Image, UnidentifiedImageError

from . import loader

_predict_lock = threading.Lock()
ALLOWED = {"JPEG": ".jpg", "PNG": ".png"}
LOW_CONFIDENCE = 0.60
KVK = "Confirm with your local Krishi Vigyan Kendra (KVK) or agriculture officer before spraying."

# Widely used, general first steps by type of problem (not a treatment plan)
GENERAL = {
    "fungal": "Remove and destroy badly affected leaves, avoid wetting the leaves when watering, "
              "and keep space between plants for air flow.",
    "bacterial": "Remove affected leaves, avoid overhead watering and do not handle plants while they are wet.",
    "viral": "Viral diseases cannot be cured by spraying. Remove infected plants to protect the others and "
             "control the insects that spread the virus.",
    "pest": "This is damage from a pest, not a disease. Check the underside of leaves and act early.",
}


def _kind(condition):
    c = condition.lower()
    if "virus" in c or "greening" in c or "mosaic" in c:
        return "viral"
    if "bacterial" in c:
        return "bacterial"
    if "mite" in c:
        return "pest"
    return "fungal"


def plain(raw):
    plant, _, condition = raw.partition("___")
    plant = plant.replace("_", " ").replace(",", "").replace("(including sour)", "")
    plant = " ".join(plant.split())
    condition = " ".join(condition.replace("_", " ").split())
    healthy = condition.lower() == "healthy"
    return {"plant": plant, "condition": "Healthy" if healthy else condition[:1].upper() + condition[1:],
            "is_healthy": healthy}


def class_names():
    path = loader.ML_DIR / "models" / "class_names.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


def supported_plants():
    return sorted({plain(c)["plant"] for c in class_names()})


def validate(data: bytes):
    try:
        img = Image.open(io.BytesIO(data))
        fmt = img.format
        img.verify()
    except (UnidentifiedImageError, OSError):
        raise ValueError("This file is not a readable image. Please upload a JPG or PNG photo.")
    if fmt not in ALLOWED:
        raise ValueError("Please upload a JPG or PNG photo.")
    return ALLOWED[fmt]


def thumbnail(data: bytes, size=160):
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((size, size))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def predict_bytes(data: bytes):
    m = loader.require("leaf")
    suffix = validate(data)
    fd, path = tempfile.mkstemp(suffix=suffix, dir=str(loader.settings.upload_dir))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        with _predict_lock:
            r = m.predict_disease(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return describe(r)


def describe(r):
    main = plain(r["disease"])
    conf = float(r["confidence"])
    result = {
        "raw_class": r["disease"], **main, "confidence": round(conf * 100, 1),
        "low_confidence": conf < LOW_CONFIDENCE,
        "top": [{**plain(p["disease"]), "raw_class": p["disease"], "confidence": round(float(p["confidence"]) * 100, 1)}
                for p in r["top_predictions"]],
        "note": "Trained on clean single-leaf photos on plain backgrounds; field photos are less accurate.",
    }
    if main["is_healthy"]:
        result["advice"] = "No disease found; keep checking your plants regularly."
    else:
        result["advice"] = GENERAL[_kind(main["condition"])]
        result["kvk"] = KVK
    return result


def guide():
    plants = supported_plants()
    return {
        "tool": "leaf", "available": bool(plants) and loader.status()["leaf"]["state"] != "missing",
        "question": "Is my plant sick?",
        "output": "Plant and condition (e.g. Tomato — Early blight), confidence and next steps",
        "time": "About 30 seconds", "supported_plants": plants,
        "accuracy": "Works best on clear photos of one leaf; real field photos are less accurate.",
        "fields": [
            {"key": "photo", "name": "One leaf photo", "required": True, "unit": "JPG or PNG, up to 8 MB",
             "example": "tomato-leaf.jpg", "where": "Take it with your phone camera in daylight."},
            {"key": "plant", "name": "Plant type", "required": False, "example": "Tomato",
             "skip": "Optional — the model recognises the plant by itself."},
        ],
        "photo_tips": [
            "One leaf only, filling most of the frame",
            "Daylight, no flash, no strong shadows",
            "Plain background — paper, cloth or the palm of your hand",
            "Show the affected side of the leaf and keep it in focus",
        ],
    }
