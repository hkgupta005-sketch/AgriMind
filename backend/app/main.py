"""AgriMind web API.

    cd backend
    python -m uvicorn app.main:app --port 8000      (or: python run.py)

Open http://127.0.0.1:8000/docs for the interactive API reference.
"""

import logging
import sys
from pathlib import Path

# chatbot.py and the predict scripts print Hindi/emoji text; never crash on a cp1252 console
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from .config import settings  # noqa: E402
from .db import init_db  # noqa: E402
from .ml import loader  # noqa: E402
from .routers import (account, chat, crops, dashboard, irrigation, leaf, market, production,  # noqa: E402
                      system)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("agrimind")

app = FastAPI(title="AgriMind API", version="2.0",
              description="Crop production, pre-irrigation, leaf disease, mandi price and crop recommendation "
                          "models from the AgriMind project, plus saved history and the AgriMind Assistant.")

app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"])


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        body = {"message": detail.get("message", "Request failed"), "code": detail.get("code"),
                "detail": detail.get("detail")}
    else:
        body = {"message": str(detail), "code": None, "detail": None}
    return JSONResponse({"error": body}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    fields = []
    for e in exc.errors():
        loc = [str(p) for p in e.get("loc", []) if p not in ("body", "query", "path")]
        msg = e.get("msg", "Invalid value").removeprefix("Value error, ")
        fields.append({"field": ".".join(loc) or None, "message": msg})
    message = fields[0]["message"] if len(fields) == 1 else "Please check the highlighted values."
    return JSONResponse({"error": {"message": message, "code": "validation", "detail": fields}}, status_code=422)


@app.exception_handler(Exception)
async def unexpected_error(_: Request, exc: Exception):
    log.exception("Unhandled error: %s", exc)       # details stay in the server log only
    return JSONResponse({"error": {"message": "Something went wrong on the server. Please try again.",
                                   "code": "server_error", "detail": None}}, status_code=500)


for r in (system.router, account.router, dashboard.router, production.router, irrigation.router, leaf.router,
          market.router, crops.router, chat.router):
    app.include_router(r)


# Production: serve the built frontend (frontend/dist) from the same origin, with SPA fallback.
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        file = (FRONTEND_DIST / path).resolve()
        if path and file.is_file() and FRONTEND_DIST in file.parents:
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html")


@app.on_event("startup")
def startup():
    log.info("AgriMind ML folder: %s", loader.ML_DIR)
    if not loader.ML_DIR.is_dir():
        log.error("AGRIMIND_ML_DIR does not exist. Model features will show 'not configured'.")
    init_db()
    loader.start_preload()
