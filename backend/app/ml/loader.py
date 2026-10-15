"""Load the existing AgriMind predict_*.py modules once and share them.

The predict files load their .pkl/.csv files with relative paths, so the process works from
AGRIMIND_ML_DIR (chatbot.py does the same). Everything else in the backend uses absolute paths.
"""

import importlib.util
import logging
import os
import sys
import threading
import warnings
from pathlib import Path

import pandas as pd
from fastapi import HTTPException

from ..config import settings

log = logging.getLogger("agrimind.ml")

ML_DIR: Path = settings.ml_dir

# key -> candidate file names (the production file may still be called "python predict_production.py")
FILES = {
    "production": ("predict_production.py", "python predict_production.py"),
    "irrigation": ("predict_irrigation.py",),
    "price": ("predict_price.py",),
    "crop": ("predict_crop.py",),
    "leaf": ("scripts/predict.py",),
    "chatbot": ("chatbot.py",),
}
LABELS = {
    "production": "Crop production model",
    "irrigation": "Irrigation model",
    "price": "Mandi price model",
    "crop": "Crop recommendation model",
    "leaf": "Leaf disease model",
    "chatbot": "AgriMind Assistant",
}

_modules: dict = {}
_status: dict = {k: {"state": "pending", "error": None} for k in FILES}
_locks = {k: threading.Lock() for k in FILES}
_csv: dict = {}
_csv_lock = threading.Lock()


def _prepare_process():
    if ML_DIR.is_dir():
        os.chdir(ML_DIR)
        if str(ML_DIR) not in sys.path:
            sys.path.insert(0, str(ML_DIR))
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
    warnings.filterwarnings("ignore", category=FutureWarning)
    warnings.filterwarnings("ignore", message=".*InconsistentVersionWarning.*")


_prepare_process()


def _find(key):
    for name in FILES[key]:
        path = ML_DIR / name
        if path.exists():
            return path
    return None


def get(key):
    """The loaded module, or None if it is missing/broken (status explains why)."""
    if key in _modules:
        return _modules[key]
    with _locks[key]:
        if key in _modules:
            return _modules[key]
        path = _find(key)
        if path is None:
            _status[key] = {"state": "missing",
                            "error": f"{' or '.join(FILES[key])} not found in AGRIMIND_ML_DIR"}
            return None
        _status[key] = {"state": "loading", "error": None}
        try:
            spec = importlib.util.spec_from_file_location(f"agrimind_{key}", path)
            module = importlib.util.module_from_spec(spec)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                spec.loader.exec_module(module)
            if key == "leaf":
                module.load_model_and_classes()          # TensorFlow: load once, not per request
            _modules[key] = module
            _status[key] = {"state": "ready", "error": None}
            log.info("Loaded %s from %s", key, path.name)
            return module
        except FileNotFoundError as e:
            _status[key] = {"state": "missing", "error": str(e)}
        except ImportError as e:
            _status[key] = {"state": "error", "error": f"Missing Python package: {e.name or e}"}
        except Exception as e:  # noqa: BLE001
            _status[key] = {"state": "error", "error": f"{type(e).__name__}: {e}"}
        log.error("Could not load %s: %s", key, _status[key]["error"])
        return None


def require(key):
    module = get(key)
    if module is None:
        raise HTTPException(503, {"message": f"{LABELS[key]} is not configured yet.",
                                  "detail": _status[key]["error"]})
    return module


def status():
    return {k: {"label": LABELS[k], **_status[k]} for k in FILES}


def csv(name):
    """Dataset CSV from the ML folder (cached). None if the file is missing."""
    with _csv_lock:
        if name not in _csv:
            path = ML_DIR / name
            if not path.exists():
                return None
            df = pd.read_csv(path)
            df.columns = df.columns.str.strip()
            for col in df.select_dtypes(include="object").columns:
                df[col] = df[col].astype(str).str.strip()
            _csv[name] = df
        return _csv[name]


def preload():
    """Load the fast models first, then (optionally) TensorFlow."""
    for key in ("production", "irrigation", "price", "crop"):
        get(key)
    for name in ("irrigation_prediction.csv", "crop_rec.csv", "daily_price.csv", "crop_production.csv"):
        try:
            csv(name)
        except Exception as e:  # noqa: BLE001
            log.warning("Could not read %s: %s", name, e)
    if settings.preload_leaf_model:
        get("leaf")


def start_preload():
    threading.Thread(target=preload, name="ml-preload", daemon=True).start()
