from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_roles
from app.database import get_db
from app.models import AuditLog, BloodUnit, TransferRequest, User
from app.schemas import TransferOut, TransferRecommendIn
from app.services.transfers import approve_transfer, recommend_transfer

router = APIRouter(prefix="/api/transfers", tags=["transfers"])


@router.get("", response_model=list[TransferOut])
def list_transfers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(TransferRequest).order_by(TransferRequest.created_at.desc())
    if user.facility_id and user.role != "network_administrator":
        query = query.where(
            (TransferRequest.source_facility_id == user.facility_id)
            | (TransferRequest.destination_facility_id == user.facility_id)
        )
    return list(db.scalars(query))


@router.post("/recommend", response_model=TransferOut, status_code=status.HTTP_201_CREATED)
def create_recommendation(
    payload: TransferRecommendIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("network_administrator", "blood_bank_manager", "hospital_inventory_officer")),
):
    try:
        return recommend_transfer(
            db,
            user,
            payload.source_facility_id,
            payload.destination_facility_id,
            payload.blood_group,
            payload.component,
            payload.units,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/{transfer_id}/approve", response_model=TransferOut)
def approve(
    transfer_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("network_administrator", "blood_bank_manager")),
):
    transfer = db.scalar(
        select(TransferRequest).where(TransferRequest.id == transfer_id).with_for_update()
    )
    if transfer is None:
        raise HTTPException(status_code=404, detail="Transfer not found")
    try:
        return approve_transfer(db, transfer, user)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/{transfer_id}/complete", response_model=TransferOut)
def complete(
    transfer_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("network_administrator", "blood_bank_manager")),
):
    transfer = db.scalar(
        select(TransferRequest).where(TransferRequest.id == transfer_id).with_for_update()
    )
    if transfer is None:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.status != "approved":
        raise HTTPException(status_code=409, detail="Only approved transfers can be completed")
    if user.role == "blood_bank_manager" and user.facility_id not in (
        transfer.source_facility_id,
        transfer.destination_facility_id,
    ):
        raise HTTPException(status_code=403, detail="Manager must belong to the source or destination facility")
    reserved = list(
        db.scalars(
            select(BloodUnit)
            .where(
                BloodUnit.facility_id == transfer.source_facility_id,
                BloodUnit.blood_group == transfer.blood_group,
                BloodUnit.component == transfer.component,
                BloodUnit.transfer_id == transfer.id,
            )
            .order_by(BloodUnit.expiry_date, BloodUnit.id)
            .with_for_update()
        )
    )
    if len(reserved) != transfer.units or any(
        unit.reservation_status != "reserved"
        or unit.screening_status != "released"
        or unit.cold_chain_status != "normal"
        or unit.expiry_date < date.today()
        for unit in reserved
    ):
        transfer.status = "blocked"
        for unit in reserved:
            if unit.reservation_status == "reserved":
                unit.reservation_status = "available"
                unit.transfer_id = None
        db.add(
            AuditLog(
                user_id=user.id,
                action="transfer_blocked",
                entity_id=transfer.id,
                details="Eligibility changed before completion; manual review required",
            )
        )
        db.commit()
        raise HTTPException(status_code=409, detail="Transfer blocked because a reserved unit is no longer eligible")
    for unit in reserved:
        unit.facility_id = transfer.destination_facility_id
        unit.reservation_status = "available"
        unit.transfer_id = None
    transfer.status = "completed"
    db.add(AuditLog(user_id=user.id, action="transfer_completed", entity_id=transfer.id, details="Human-recorded completion"))
    db.commit()
    db.refresh(transfer)
    return transfer
