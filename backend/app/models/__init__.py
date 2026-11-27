from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Facility(Base):
    __tablename__ = "facilities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    county: Mapped[str] = mapped_column(String(100), nullable=False)
    facility_type: Mapped[str] = mapped_column(String(60), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    simulated: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    daily_demand: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    safety_stock: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    users: Mapped[list["User"]] = relationship(back_populates="facility")
    units: Mapped[list["BloodUnit"]] = relationship(back_populates="facility")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    facility_id: Mapped[str | None] = mapped_column(ForeignKey("facilities.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    facility: Mapped[Facility | None] = relationship(back_populates="users")


class BloodUnit(Base):
    __tablename__ = "blood_units"
    __table_args__ = (
        Index("ix_units_facility_product", "facility_id", "blood_group", "component"),
        Index("ix_units_expiry", "expiry_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    facility_id: Mapped[str] = mapped_column(ForeignKey("facilities.id"), nullable=False)
    blood_group: Mapped[str] = mapped_column(String(3), nullable=False)
    component: Mapped[str] = mapped_column(String(30), nullable=False)
    collection_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    screening_status: Mapped[str] = mapped_column(String(20), default="released", nullable=False)
    reservation_status: Mapped[str] = mapped_column(String(20), default="available", nullable=False)
    cold_chain_status: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)
    transfer_id: Mapped[str | None] = mapped_column(ForeignKey("transfer_requests.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    facility: Mapped[Facility] = relationship(back_populates="units")


class DemandHistory(Base):
    __tablename__ = "demand_history"
    __table_args__ = (Index("ix_demand_facility_date", "facility_id", "demand_date"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    facility_id: Mapped[str] = mapped_column(ForeignKey("facilities.id"), nullable=False)
    blood_group: Mapped[str] = mapped_column(String(3), nullable=False)
    component: Mapped[str] = mapped_column(String(30), nullable=False)
    demand_date: Mapped[date] = mapped_column(Date, nullable=False)
    units_requested: Mapped[int] = mapped_column(Integer, nullable=False)


class TransferRequest(Base):
    __tablename__ = "transfer_requests"
    __table_args__ = (
        Index(
            "uq_active_transfer_route",
            "source_facility_id",
            "destination_facility_id",
            "blood_group",
            "component",
            unique=True,
            postgresql_where=text("status IN ('recommended', 'approved')"),
            sqlite_where=text("status IN ('recommended', 'approved')"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_facility_id: Mapped[str] = mapped_column(ForeignKey("facilities.id"), nullable=False)
    destination_facility_id: Mapped[str] = mapped_column(ForeignKey("facilities.id"), nullable=False)
    blood_group: Mapped[str] = mapped_column(String(3), nullable=False)
    component: Mapped[str] = mapped_column(String(30), nullable=False)
    units: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="recommended", nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    details: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class TemperatureEvent(Base):
    __tablename__ = "temperature_events"
    __table_args__ = (Index("ix_temperature_unit_time", "unit_id", "recorded_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    unit_id: Mapped[str] = mapped_column(ForeignKey("blood_units.id"), nullable=False)
    temperature_c: Mapped[float] = mapped_column(Float, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    notes: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="quarantined_review_required", nullable=False)
    recorded_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
