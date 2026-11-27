from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import require_roles
from app.database import get_db
from app.models import AuditLog, BloodUnit, TemperatureEvent, TransferRequest, User
from app.schemas import TemperatureEventIn, TemperatureEventOut

router = APIRouter(prefix="/api/temperature-events", tags=["cold chain"])
WRITE_ROLES = ("network_administrator", "blood_bank_manager", "hospital_inventory_officer")


@router.get("", response_model=list[TemperatureEventOut])
def list_events(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES, "read_only_analyst")),
):
    query = select(TemperatureEvent).order_by(TemperatureEvent.recorded_at.desc()).limit(200)
    if user.facility_id and user.role != "network_administrator":
        query = query.join(BloodUnit).where(BloodUnit.facility_id == user.facility_id)
    return list(db.scalars(query))


@router.post("", response_model=TemperatureEventOut, status_code=status.HTTP_201_CREATED)
def report_event(
    payload: TemperatureEventIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*WRITE_ROLES)),
):
    unit = db.get(BloodUnit, payload.unit_id)
    if unit is None:
        raise HTTPException(status_code=404, detail="Inventory unit not found")
    transfer = None
    if unit.transfer_id:
        transfer = db.scalar(
            select(TransferRequest).where(TransferRequest.id == unit.transfer_id).with_for_update()
        )
    unit = db.scalar(
        select(BloodUnit).where(BloodUnit.id == payload.unit_id).with_for_update()
    )
    if unit is None:
        raise HTTPException(status_code=404, detail="Inventory unit no longer exists")
    if user.facility_id and unit.facility_id != user.facility_id and user.role != "network_administrator":
        raise HTTPException(status_code=403, detail="Cannot report a cold-chain event for another facility")
    unit.cold_chain_status = "breach"
    unit.screening_status = "quarantined"
    if transfer and transfer.status == "approved" and unit.transfer_id == transfer.id:
        transfer.status = "blocked"
        reserved_units = db.scalars(
            select(BloodUnit)
            .where(BloodUnit.transfer_id == transfer.id)
            .order_by(BloodUnit.id)
            .with_for_update()
        )
        for reserved_unit in reserved_units:
            reserved_unit.reservation_status = "available"
            reserved_unit.transfer_id = None
        db.add(
            AuditLog(
                user_id=user.id,
                action="transfer_blocked",
                entity_id=transfer.id,
                details="Cold-chain breach on a reserved unit; human review required",
            )
        )
    event = TemperatureEvent(
        unit_id=unit.id,
        temperature_c=payload.temperature_c,
        notes=payload.notes,
        status="quarantined_review_required",
        recorded_by=user.id,
    )
    db.add(event)
    db.add(
        AuditLog(
            user_id=user.id,
            action="cold_chain_breach_reported",
            entity_id=unit.id,
            details="Unit quarantined pending qualified human review",
        )
    )
    db.commit()
    db.refresh(event)
    return event
