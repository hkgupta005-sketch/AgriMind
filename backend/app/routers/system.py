"""Health, form options, "What you need" guides and name resolution."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from ..db import DB_STATUS
from ..ml import crop, irrigation, leaf, loader, price, production
from ..ml.resolve import MANDI_NAMES, PRODUCTION_NAMES, STATE_SHORT, resolve
from ..services import assistant
from .common import call_model

router = APIRouter(prefix="/api", tags=["System"])

Tool = Literal["production", "irrigation", "leaf", "price", "crop"]
GUIDES = {"production": production.guide, "irrigation": irrigation.guide, "leaf": leaf.guide,
          "price": price.guide, "crop": crop.guide}


@router.get("/health")
def health():
    return {"status": "ok", "database": {"backend": DB_STATUS["backend"], "connected": DB_STATUS["ok"]},
            "models": loader.status(), "assistant": assistant.status()}


@router.get("/guide/{tool}")
def guide(tool: Tool):
    return GUIDES[tool]()


@router.get("/options/{tool}")
async def options(tool: Tool, state: str | None = None, district: str | None = None,
                  market: str | None = None, commodity: str | None = None):
    if tool == "production":
        return await call_model(production.options, state, district)
    if tool == "price":
        return await call_model(price.options, state, district, market, commodity)
    if tool == "irrigation":
        return await call_model(irrigation.options)
    if tool == "crop":
        return await call_model(crop.options)
    return {"supported_plants": leaf.supported_plants(), "classes": leaf.class_names()}


@router.get("/resolve/{tool}")
async def resolve_name(tool: Literal["production", "price"],
                       field: Literal["state", "district", "crop", "market", "commodity"],
                       q: str = Query(min_length=1, max_length=120),
                       state: str | None = None, district: str | None = None):
    """Typed text -> a valid option (short forms, Hindi names, spelling), or suggestions."""
    def run():
        if tool == "production":
            o = loader.require("production").options
            if field == "state":
                return resolve(q, o["districts"].keys(), STATE_SHORT)
            if field == "district":
                return resolve(q, o["districts"].get(state, []) if state else o["crops"].keys())
            if field == "crop":
                return resolve(q, o["crops"].get(district, []), PRODUCTION_NAMES)
        else:
            o = loader.require("price").options
            if field == "state":
                return resolve(q, o["districts"].keys(), STATE_SHORT)
            if field == "district":
                return resolve(q, o["districts"].get(state, []) if state else o["markets"].keys())
            if field == "market":
                return resolve(q, o["markets"].get(district, []))
            if field in ("commodity", "crop"):
                return resolve(q, o["commodities"], MANDI_NAMES)
        raise HTTPException(400, f"Field '{field}' is not used by {tool}")
    return await call_model(run)
