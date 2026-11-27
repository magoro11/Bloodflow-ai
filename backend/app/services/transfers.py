from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AuditLog, BloodUnit, Facility, TransferRequest, User
from app.services.forecasting import moving_average_forecast
from app.services.inventory import eligible_units


def recommend_transfer(
    db: Session,
    user: User,
    source_facility_id: str | None,
    destination_facility_id: str,
    blood_group: str,
    component: str,
    requested_units: int,
) -> TransferRequest:
    destination = db.get(Facility, destination_facility_id)
    if destination is None:
        raise ValueError("Destination facility not found")
    source_facility_id = source_facility_id or user.facility_id
    if source_facility_id == destination_facility_id:
        raise ValueError("Source and destination facilities must differ")
    if source_facility_id is None:
        raise ValueError("An authorized source facility is required")
    if user.role != "network_administrator" and user.facility_id != source_facility_id:
        raise PermissionError("Users may only recommend transfers from their assigned facility")
    source = db.get(Facility, source_facility_id)
    if source is None:
        raise ValueError("Source facility not found")
    destination_forecast = moving_average_forecast(db, destination.id, blood_group, component, 7)
    shortage = max(0, round(destination_forecast["predicted_demand"] - destination_forecast["eligible_stock"]))
    if shortage == 0:
        raise ValueError("Destination has no projected seven-day shortage for this product")
    available = eligible_units(db, source.id, blood_group, component)
    existing = db.scalar(
        select(TransferRequest.id).where(
            TransferRequest.source_facility_id == source.id,
            TransferRequest.destination_facility_id == destination.id,
            TransferRequest.blood_group == blood_group,
            TransferRequest.component == component,
            TransferRequest.status.in_(("recommended", "approved")),
        )
    )
    if existing:
        raise ValueError("An active recommendation already exists for this route and product")
    source_forecast = moving_average_forecast(db, source.id, blood_group, component, 7)
    protected_stock = max(source.safety_stock, round(source_forecast["predicted_demand"]))
    surplus = max(0, len(available) - protected_stock)
    units = min(requested_units, surplus, shortage)
    if units <= 0:
        raise ValueError("Source has no eligible surplus after forecast demand and safety stock")
    transfer = TransferRequest(
        source_facility_id=source.id,
        destination_facility_id=destination.id,
        blood_group=blood_group,
        component=component,
        units=units,
        status="recommended",
        reason=f"{units} eligible units remain above seven-day forecast demand and configured safety stock ({source.safety_stock}). Human approval required.",
        created_by=user.id,
    )
    db.add(transfer)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("An active recommendation already exists for this route and product") from exc
    db.refresh(transfer)
    return transfer


def approve_transfer(db: Session, transfer: TransferRequest, user: User) -> TransferRequest:
    transfer = db.scalar(
        select(TransferRequest).where(TransferRequest.id == transfer.id).with_for_update()
    )
    if transfer is None:
        raise ValueError("Transfer no longer exists")
    if transfer.status != "recommended":
        raise ValueError("Only recommended transfers can be approved")
    if user.role not in ("network_administrator", "blood_bank_manager"):
        raise PermissionError("Only a network administrator or blood-bank manager can approve")
    if user.role == "blood_bank_manager" and user.facility_id not in (
        transfer.source_facility_id,
        transfer.destination_facility_id,
    ):
        raise PermissionError("Manager must belong to the source or destination facility")
    source = db.get(Facility, transfer.source_facility_id)
    if source is None:
        raise ValueError("Source facility no longer exists")
    available = list(
        db.scalars(
            select(BloodUnit)
            .where(
                BloodUnit.facility_id == source.id,
                BloodUnit.blood_group == transfer.blood_group,
                BloodUnit.component == transfer.component,
                BloodUnit.screening_status == "released",
                BloodUnit.reservation_status == "available",
                BloodUnit.cold_chain_status == "normal",
                BloodUnit.expiry_date >= date.today(),
            )
            .order_by(BloodUnit.expiry_date, BloodUnit.id)
            .with_for_update()
        )
    )
    source_forecast = moving_average_forecast(db, source.id, transfer.blood_group, transfer.component, 7)
    protected_stock = max(source.safety_stock, round(source_forecast["predicted_demand"]))
    if len(available) - transfer.units < protected_stock:
        raise ValueError("Current eligible stock no longer covers forecast demand and configured safety stock")
    for unit in available[: transfer.units]:
        unit.reservation_status = "reserved"
        unit.transfer_id = transfer.id
    transfer.status = "approved"
    transfer.approved_by = user.id
    db.add(
        AuditLog(
            user_id=user.id,
            action="transfer_approved",
            entity_id=transfer.id,
            details=f"Human-approved transfer of {transfer.units} units",
        )
    )
    db.commit()
    db.refresh(transfer)
    return transfer
