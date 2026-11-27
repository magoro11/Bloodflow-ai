from datetime import date, timedelta

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
    # Use the most recent 28 calendar days, including today.
    end_date = date.today()
    start_date = end_date - timedelta(days=27)

    # Aggregate demand by date.
    daily_rows = db.execute(
        select(
            DemandHistory.demand_date,
            func.sum(DemandHistory.units_requested),
        )
        .where(
            DemandHistory.facility_id == facility_id,
            DemandHistory.blood_group == blood_group,
            DemandHistory.component == component,
            DemandHistory.demand_date.between(start_date, end_date),
        )
        .group_by(DemandHistory.demand_date)
        .order_by(DemandHistory.demand_date)
    ).all()

    # Average only dates with recorded demand.
    daily_values = [float(total or 0) for _, total in daily_rows]

    observed_days = len(daily_values)
    daily_average = (
        sum(daily_values) / observed_days
        if observed_days
        else 0.0
    )

    predicted = round(daily_average * horizon_days, 2)

    stock = get_stock(
        db,
        facility_id,
        blood_group,
        component,
    )

    return {
        "facility_id": facility_id,
        "blood_group": blood_group,
        "component": component,
        "horizon_days": horizon_days,
        "predicted_demand": predicted,
        "daily_average": round(daily_average, 3),
        "model": "trailing_28_day_daily_average",
        "synthetic_data": True,
        "shortage_expected": stock < predicted,
        "eligible_stock": stock,
    }