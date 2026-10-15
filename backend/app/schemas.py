"""Request bodies (Pydantic). Numeric limits block impossible values; values outside the
training data are allowed and produce model warnings instead."""

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

ACRES_PER_HA = 2.471


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)


class ProfileIn(BaseModel):
    display_name: Optional[str] = Field(None, max_length=80)
    state: Optional[str] = Field(None, max_length=80)
    district: Optional[str] = Field(None, max_length=80)
    farm_area_ha: Optional[float] = Field(None, gt=0, le=100000)
    soil_type: Optional[Literal["Clay", "Loamy", "Sandy", "Silt"]] = None
    area_unit: Literal["ha", "acre"] = "ha"
    weight_unit: Literal["kg", "quintal"] = "quintal"
    common_crops: Optional[list[str]] = Field(None, max_length=20)


class ProductionEstimateIn(BaseModel):
    state: str = Field(min_length=1, max_length=80)
    district: str = Field(min_length=1, max_length=80)
    season: str = Field(min_length=1, max_length=20)
    crop: str = Field(min_length=1, max_length=80)
    year: int = Field(ge=1950, le=2100)
    area: float = Field(gt=0, le=1_000_000, description="Field area in area_unit")
    area_unit: Literal["ha", "acre"] = "ha"
    save: bool = True

    @property
    def area_ha(self):
        return self.area / ACRES_PER_HA if self.area_unit == "acre" else self.area


class ProductionRecordIn(BaseModel):
    crop: str = Field(min_length=1, max_length=80)
    season: str = Field(min_length=1, max_length=20)
    crop_year: int = Field(ge=1950, le=2100)
    area_ha: float = Field(gt=0, le=1_000_000)
    state: Optional[str] = Field(None, max_length=80)
    district: Optional[str] = Field(None, max_length=80)
    sowing_date: Optional[date] = None
    harvest_date: Optional[date] = None
    actual_production_t: Optional[float] = Field(None, ge=0, le=10_000_000)
    estimated_production_t: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.sowing_date and self.harvest_date and self.harvest_date < self.sowing_date:
            raise ValueError("Harvest date cannot be before the sowing date")
        return self


SoilFeel = Literal["very_dry", "dry", "slightly_moist", "moist", "wet"]


class IrrigationDetails(BaseModel):
    state: Optional[str] = Field(None, max_length=80)
    soil_type: Optional[str] = Field(None, max_length=20)
    irrigation_type: Optional[str] = Field(None, max_length=20)
    water_source: Optional[str] = Field(None, max_length=20)
    humidity: Optional[Literal["dry", "normal", "humid"]] = None
    sunlight_hours: Optional[float] = Field(None, ge=0, le=24)
    field_area_ha: Optional[float] = Field(None, gt=0, le=100000)
    previous_water: Optional[Literal["very_little", "normal", "a_lot"]] = None
    soil_ph: Optional[float] = Field(None, ge=0, le=14)
    organic_carbon: Optional[float] = Field(None, ge=0, le=20)
    ec: Optional[float] = Field(None, ge=0, le=50)


class IrrigationQuick(BaseModel):
    crop: str = Field(max_length=20)
    growth_stage: str = Field(max_length=20)
    season: str = Field(max_length=20)
    soil_feel: Optional[SoilFeel] = None
    soil_moisture_pct: Optional[float] = Field(None, ge=0, le=100, description="Moisture meter reading, if any")
    temperature_c: float = Field(ge=-20, le=60)
    rain: Literal["very_little", "below_normal", "normal", "good", "heavy"]
    wind: Literal["calm", "light", "breezy", "windy"]
    mulch: bool
    details: Optional[IrrigationDetails] = None
    save: bool = True

    @model_validator(mode="after")
    def moisture_given(self):
        if self.soil_feel is None and self.soil_moisture_pct is None:
            raise ValueError("Tell us how the soil feels, or type your moisture-meter reading")
        return self


class PriceIn(BaseModel):
    state: str = Field(min_length=1, max_length=80)
    district: str = Field(min_length=1, max_length=80)
    market: str = Field(min_length=1, max_length=120)
    commodity: str = Field(min_length=1, max_length=120)
    variety: Optional[str] = Field(None, max_length=120)
    grade: Optional[Literal["FAQ", "Large", "Medium", "Small"]] = None
    save: bool = True


class CropIn(BaseModel):
    N: Optional[float] = Field(None, ge=0, le=1000)
    P: Optional[float] = Field(None, ge=0, le=1000)
    K: Optional[float] = Field(None, ge=0, le=1000)
    ph: Optional[float] = Field(None, ge=0, le=14)
    temperature: float = Field(ge=-20, le=60)
    humidity: float = Field(ge=0, le=100)
    rainfall: Optional[float] = Field(None, ge=0, le=10000)
    rainfall_preset: Optional[Literal["low", "medium", "high"]] = None
    save: bool = True

    @model_validator(mode="after")
    def rain_given(self):
        if self.rainfall is None and self.rainfall_preset is None:
            raise ValueError("Enter the rainfall in mm, or choose Low / Medium / High")
        return self


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: Optional[str] = Field(None, max_length=64)
    page: Optional[str] = Field(None, max_length=40)

    @field_validator("message")
    @classmethod
    def not_blank(cls, v):
        if not v.strip():
            raise ValueError("Message is empty")
        return v.strip()
