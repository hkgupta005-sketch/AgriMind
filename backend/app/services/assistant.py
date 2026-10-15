"""AgriMind Assistant: a thin wrapper around the existing chatbot.py (make_client + ask).

- The assistant logic, system instruction and 9 tools stay in chatbot.py.
- The models already loaded by the backend are shared with chatbot.py, so TensorFlow is not
  loaded twice.
- chatbot.run_tool is wrapped to record which tools ran for each message (tools_used),
  instead of parsing the "[tool] ..." console output.
"""

import threading
import time
from collections import defaultdict, deque
from urllib.parse import urlencode

from ..ml import loader

TOOL_INFO = {
    "predict_crop_production": ("Crop production model", "/production"),
    "recommend_crop": ("Crop recommendation model", "/crop-analysis"),
    "predict_market_price": ("Mandi price model", "/crop-price"),
    "predict_irrigation_need": ("Irrigation model", "/irrigation"),
    "detect_plant_disease": ("Leaf disease model", "/leaf-prediction"),
    "get_production_history": ("Crop production dataset", "/production"),
    "get_crop_requirements": ("Crop requirements dataset", "/crop-analysis"),
    "get_market_prices": ("Mandi price dataset", "/crop-price"),
    "list_valid_names": ("List of valid names", None),
}
# tool arguments that the matching page can prefill from the URL
PREFILL = {
    "predict_crop_production": ["state", "district", "season", "crop", "year", "area"],
    "predict_market_price": ["state", "district", "market", "commodity", "variety", "grade"],
    "recommend_crop": ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"],
    "get_market_prices": ["commodity", "state", "district"],
}


class AssistantError(Exception):
    def __init__(self, code, message, status=503):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


_calls = threading.local()
_client = None
_client_lock = threading.Lock()
_bot = None


def _get_bot():
    global _bot
    if _bot is not None:
        return _bot
    bot = loader.get("chatbot")
    if bot is None:
        raise AssistantError("not_configured", "Assistant not configured yet.")
    # share the backend's loaded models with the chatbot (same keys chatbot.py uses)
    for ours, theirs in (("production", "production"), ("crop", "crop"), ("price", "price"),
                         ("irrigation", "irrigation"), ("leaf", "disease")):
        if ours in loader._modules:
            bot._modules.setdefault(theirs, loader._modules[ours])

    original = bot.run_tool

    def recording_run_tool(name, arguments):
        result = original(name, arguments)
        log = getattr(_calls, "log", None)
        if log is not None:
            log.append({"name": name.split(":")[-1], "args": arguments or {},
                        "ok": not (isinstance(result, dict) and "error" in result)})
        return result

    bot.run_tool = recording_run_tool
    _bot = bot
    return bot


def _get_client(bot):
    global _client
    with _client_lock:
        if _client is None:
            try:
                _client = bot.make_client()
            except SystemExit:
                raise AssistantError("not_configured", "Assistant not configured yet (Gemini key missing).")
            except ImportError:
                raise AssistantError("not_configured", "Assistant not configured yet (google-genai not installed).")
        return _client


def _describe(calls):
    seen, out = set(), []
    for c in calls:
        if c["name"] in seen or c["name"] not in TOOL_INFO:
            continue
        seen.add(c["name"])
        label, link = TOOL_INFO[c["name"]]
        if link and c["name"] in PREFILL and c["ok"]:
            params = {k: c["args"][k] for k in PREFILL[c["name"]] if c["args"].get(k) not in (None, "")}
            if params:
                link = f"{link}?{urlencode(params)}"
        out.append({"name": c["name"], "label": label, "link": link})
    return out


def ask_blocking(message, previous_id):
    """Runs in a worker thread. Returns (reply, gemini_conversation_id, tools_used)."""
    bot = _get_bot()
    client = _get_client(bot)
    _calls.log = []
    try:
        reply, new_id = bot.ask(client, message, previous_id)
    except RuntimeError as e:
        if "busy" in str(e).lower():
            raise AssistantError("busy", "The assistant is busy, please try again in a minute.")
        raise AssistantError("error", "The assistant could not answer right now. Please try again.", 502)
    except AssistantError:
        raise
    except Exception as e:  # noqa: BLE001
        text = str(e).lower()
        if any(k in text for k in ("api key", "api_key", "permission", "401", "403")):
            raise AssistantError("not_configured", "Assistant not configured yet (the Gemini key was rejected).")
        if any(k in text for k in ("503", "429", "unavailable", "overloaded", "exhausted")):
            raise AssistantError("busy", "The assistant is busy, please try again in a minute.")
        raise AssistantError("error", "The assistant could not answer right now. Please try again.", 502)
    finally:
        calls, _calls.log = _calls.log, None
    return reply, new_id, _describe(calls)


def status():
    s = loader.status()["chatbot"]
    if s["state"] == "missing":
        return "unavailable"
    return "online"


class RateLimiter:
    def __init__(self, per_minute):
        self.per_minute = per_minute
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key):
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_minute:
                return False
            q.append(now)
            return True
