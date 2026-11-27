from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DemandHistory
from app.services.inventory import get_stock


def moving_average_forecast(
    db: Session,
    facility_id: str,
    blood_group: str,
    component: str,
    horizon_days: int,
) -> dict:
    daily_average = db.scalar(
        select(func.avg(DemandHistory.units_requested)).where(
            DemandHistory.facility_id == facility_id,
            DemandHistory.blood_group == blood_group,
            DemandHistory.component == component,
        )
    )
    daily_average = float(daily_average or 0)
    predicted = round(daily_average * horizon_days, 2)
    stock = get_stock(db, facility_id, blood_group, component)
    return {
        "facility_id": facility_id,
        "blood_group": blood_group,
        "component": component,
        "horizon_days": horizon_days,
        "predicted_demand": predicted,
        "daily_average": round(daily_average, 3),
        "model": "moving_average_baseline",
        "synthetic_data": True,
        "shortage_expected": stock < predicted,
        "eligible_stock": stock,
    }
