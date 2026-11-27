from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


BloodGroup = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
Component = Literal["whole_blood", "red_blood_cells", "platelets", "plasma"]
Role = Literal["network_administrator", "blood_bank_manager", "hospital_inventory_officer", "read_only_analyst"]


class UserOut(BaseModel):
    id: str
    email: EmailStr
    role: Role
    facility_id: str | None
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class FacilityIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    county: str = Field(min_length=2, max_length=100)
    facility_type: str = Field(min_length=2, max_length=60)
    latitude: float = Field(ge=-5, le=5)
    longitude: float = Field(ge=33, le=42)
    daily_demand: int = Field(default=3, ge=0, le=1000)
    safety_stock: int = Field(default=5, ge=0, le=10000)


class FacilityOut(FacilityIn):
    id: str
    simulated: bool
    model_config = ConfigDict(from_attributes=True)


class UnitIn(BaseModel):
    facility_id: str
    blood_group: BloodGroup
    component: Component
    collection_date: date
    expiry_date: date
    screening_status: Literal["released", "pending", "quarantined"] = "released"
    reservation_status: Literal["available", "reserved", "transferred"] = "available"
    cold_chain_status: Literal["normal", "breach"] = "normal"

    @model_validator(mode="after")
    def validate_dates(self):
        if self.collection_date > date.today():
            raise ValueError("Collection date cannot be in the future")
        if self.expiry_date <= self.collection_date:
            raise ValueError("Expiry date must be after collection date")
        if self.cold_chain_status == "breach":
            self.screening_status = "quarantined"
        return self


class UnitOut(UnitIn):
    id: str
    updated_at: datetime
    transfer_id: str | None
    model_config = ConfigDict(from_attributes=True)


class TransferRecommendIn(BaseModel):
    source_facility_id: str | None = None
    destination_facility_id: str
    blood_group: BloodGroup
    component: Component
    units: int = Field(gt=0, le=500)


class TransferOut(BaseModel):
    id: str
    source_facility_id: str
    destination_facility_id: str
    blood_group: str
    component: str
    units: int
    status: str
    reason: str


class ForecastOut(BaseModel):
    facility_id: str
    blood_group: BloodGroup
    component: Component
    horizon_days: int
    predicted_demand: float
    daily_average: float
    model: str
    synthetic_data: bool
    shortage_expected: bool
    eligible_stock: int


class AlertOut(BaseModel):
    id: str
    facility_id: str
    facility_name: str
    blood_group: str
    component: str
    risk_level: str
    eligible_stock: int
    expected_demand_7d: float
    shortage_in_days: int | None
    explanation: str


class TemperatureEventIn(BaseModel):
    unit_id: str
    temperature_c: float = Field(ge=-100, le=100)
    notes: str = Field(min_length=5, max_length=500)


class TemperatureEventOut(BaseModel):
    id: str
    unit_id: str
    temperature_c: float
    recorded_at: datetime
    notes: str
    status: str
