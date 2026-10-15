"""Database tables. Every user-owned row has user_id and is only read through owner-filtered queries."""

from datetime import date, datetime, timezone

from sqlalchemy import (JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String,
                        Text)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False, index=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str | None] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    is_guest: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now, nullable=False)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class FarmerProfile(Base):
    __tablename__ = "farmer_profiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(80))
    district: Mapped[str | None] = mapped_column(String(80))
    farm_area_ha: Mapped[float | None] = mapped_column(Float)
    soil_type: Mapped[str | None] = mapped_column(String(20))
    area_unit: Mapped[str] = mapped_column(String(10), default="ha", nullable=False)        # ha | acre
    weight_unit: Mapped[str] = mapped_column(String(10), default="quintal", nullable=False)  # kg | quintal
    common_crops: Mapped[list | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now, nullable=False)


class ProductionEstimate(TimestampMixin, Base):
    """AI yield estimate (model output)."""
    __tablename__ = "production_estimates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False)
    season: Mapped[str] = mapped_column(String(20), nullable=False)
    crop: Mapped[str] = mapped_column(String(80), nullable=False)
    crop_year: Mapped[int] = mapped_column(Integer, nullable=False)
    area_ha: Mapped[float] = mapped_column(Float, nullable=False)
    yield_t_per_ha: Mapped[float] = mapped_column(Float, nullable=False)
    production_t: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255))


class CropProductionRecord(TimestampMixin, Base):
    """What the farmer actually grew and harvested (farmer-entered)."""
    __tablename__ = "crop_production_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    crop: Mapped[str] = mapped_column(String(80), nullable=False)
    season: Mapped[str] = mapped_column(String(20), nullable=False)
    crop_year: Mapped[int] = mapped_column(Integer, nullable=False)
    area_ha: Mapped[float] = mapped_column(Float, nullable=False)
    state: Mapped[str | None] = mapped_column(String(80))
    district: Mapped[str | None] = mapped_column(String(80))
    sowing_date: Mapped[date | None] = mapped_column(Date)
    harvest_date: Mapped[date | None] = mapped_column(Date)
    actual_production_t: Mapped[float | None] = mapped_column(Float)
    estimated_production_t: Mapped[float | None] = mapped_column(Float)   # copied from an AI estimate, if linked
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now, nullable=False)


class IrrigationRecord(TimestampMixin, Base):
    __tablename__ = "irrigation_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    crop: Mapped[str] = mapped_column(String(40), nullable=False)
    growth_stage: Mapped[str] = mapped_column(String(20), nullable=False)
    season: Mapped[str] = mapped_column(String(20), nullable=False)
    soil_moisture_pct: Mapped[float] = mapped_column(Float, nullable=False)
    soil_moisture_source: Mapped[str] = mapped_column(String(20), nullable=False)  # description | meter
    need: Mapped[str] = mapped_column(String(10), nullable=False)
    advice: Mapped[str] = mapped_column(String(255), nullable=False)
    inputs: Mapped[dict] = mapped_column(JSON, nullable=False)
    assumed: Mapped[list] = mapped_column(JSON, nullable=False)
    warnings: Mapped[list] = mapped_column(JSON, nullable=False)


class LeafPrediction(TimestampMixin, Base):
    __tablename__ = "leaf_predictions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_class: Mapped[str] = mapped_column(String(120), nullable=False)
    plant: Mapped[str] = mapped_column(String(60), nullable=False)
    condition: Mapped[str] = mapped_column(String(120), nullable=False)
    is_healthy: Mapped[bool] = mapped_column(Boolean, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    top_predictions: Mapped[list] = mapped_column(JSON, nullable=False)
    thumbnail: Mapped[str | None] = mapped_column(Text)   # small JPEG data URL; the original photo is not kept


class PriceEstimate(TimestampMixin, Base):
    __tablename__ = "market_price_estimates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False)
    market: Mapped[str] = mapped_column(String(120), nullable=False)
    commodity: Mapped[str] = mapped_column(String(120), nullable=False)
    variety: Mapped[str] = mapped_column(String(120), nullable=False)
    grade: Mapped[str] = mapped_column(String(20), nullable=False)
    price_per_quintal: Mapped[float] = mapped_column(Float, nullable=False)
    range_low: Mapped[float] = mapped_column(Float, nullable=False)
    range_high: Mapped[float] = mapped_column(Float, nullable=False)
    warnings: Mapped[list] = mapped_column(JSON, nullable=False)


class CropRecommendation(TimestampMixin, Base):
    __tablename__ = "crop_recommendations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    crop: Mapped[str] = mapped_column(String(40), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    top: Mapped[list] = mapped_column(JSON, nullable=False)
    inputs: Mapped[dict] = mapped_column(JSON, nullable=False)
    assumed: Mapped[list] = mapped_column(JSON, nullable=False)
    warnings: Mapped[list] = mapped_column(JSON, nullable=False)


class UserActivity(TimestampMixin, Base):
    __tablename__ = "user_activity"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)   # production | irrigation | leaf | price | crop | tracking
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    detail: Mapped[str | None] = mapped_column(String(255))
    link: Mapped[str | None] = mapped_column(String(80))
    __table_args__ = (Index("ix_activity_user_created", "user_id", "created_at"),)


class ChatConversation(Base):
    __tablename__ = "chat_conversations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    gemini_id: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now, nullable=False)


class ChatMessage(TimestampMixin, Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("chat_conversations.id", ondelete="CASCADE"),
                                                 nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(10), nullable=False)   # user | assistant
    text: Mapped[str] = mapped_column(Text, nullable=False)
    tools_used: Mapped[list | None] = mapped_column(JSON)
