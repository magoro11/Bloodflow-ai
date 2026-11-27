from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BloodUnit


def eligible_units(db: Session, facility_id: str, blood_group: str, component: str) -> list[BloodUnit]:
    return list(
        db.scalars(
            select(BloodUnit)
            .where(
                BloodUnit.facility_id == facility_id,
                BloodUnit.blood_group == blood_group,
                BloodUnit.component == component,
                BloodUnit.screening_status == "released",
                BloodUnit.reservation_status == "available",
                BloodUnit.cold_chain_status == "normal",
                BloodUnit.expiry_date >= date.today(),
            )
            .order_by(BloodUnit.expiry_date, BloodUnit.id)
        )
    )


def get_stock(db: Session, facility_id: str, blood_group: str, component: str) -> int:
    return len(eligible_units(db, facility_id, blood_group, component))


def near_expiry(db: Session, days: int = 7) -> list[BloodUnit]:
    today = date.today()
    return list(
        db.scalars(
            select(BloodUnit).where(
                BloodUnit.expiry_date.between(today, today + timedelta(days=days)),
                BloodUnit.reservation_status == "available",
                BloodUnit.screening_status == "released",
                BloodUnit.cold_chain_status == "normal",
            )
        )
    )
