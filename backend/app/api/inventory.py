from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import require_roles
from app.database import get_db
from app.models import BloodUnit, Facility, User
from app.schemas import BloodGroup, Component, UnitIn, UnitOut

router = APIRouter(prefix="/api/inventory", tags=["inventory"])
ACCESS_ROLES = ("network_administrator", "blood_bank_manager", "hospital_inventory_officer", "read_only_analyst")


@router.get("/units", response_model=list[UnitOut])
def list_units(
    facility_id: str | None = None,
    blood_group: BloodGroup | None = None,
    component: Component | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*ACCESS_ROLES)),
):
    query = select(BloodUnit).order_by(BloodUnit.expiry_date).limit(limit).offset(offset)
    if user.role in ("blood_bank_manager", "hospital_inventory_officer") and user.facility_id:
        if facility_id and facility_id != user.facility_id:
            raise HTTPException(status_code=403, detail="Cannot access another facility's inventory")
        facility_id = user.facility_id
    if facility_id:
        query = query.where(BloodUnit.facility_id == facility_id)
    if blood_group:
        query = query.where(BloodUnit.blood_group == blood_group)
    if component:
        query = query.where(BloodUnit.component == component)
    return list(db.scalars(query))


@router.post("/units", response_model=UnitOut, status_code=status.HTTP_201_CREATED)
def create_unit(
    payload: UnitIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("network_administrator", "blood_bank_manager", "hospital_inventory_officer")),
):
    if user.facility_id and payload.facility_id != user.facility_id and user.role != "network_administrator":
        raise HTTPException(status_code=403, detail="Cannot add inventory to another facility")
    if db.get(Facility, payload.facility_id) is None:
        raise HTTPException(status_code=404, detail="Facility not found")
    unit = BloodUnit(**payload.model_dump())
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


@router.get("/summary")
def inventory_summary(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*ACCESS_ROLES)),
):
    query = select(func.count(BloodUnit.id)).where(
        BloodUnit.screening_status == "released",
        BloodUnit.reservation_status == "available",
        BloodUnit.cold_chain_status == "normal",
        BloodUnit.expiry_date >= date.today(),
    )
    facility_query = select(func.count(Facility.id))
    if user.role in ("blood_bank_manager", "hospital_inventory_officer") and user.facility_id:
        query = query.where(BloodUnit.facility_id == user.facility_id)
        facility_query = facility_query.where(Facility.id == user.facility_id)
    return {
        "eligible_units": db.scalar(query) or 0,
        "facility_count": db.scalar(facility_query) or 0,
        "synthetic_data": True,
    }
