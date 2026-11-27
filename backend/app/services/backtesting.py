
from datetime import date, timedelta
from math import sqrt

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DemandHistory, Facility


def backtest_moving_average(
    db: Session,
    facility_id: str,
    blood_group: str,
    component: str,
    horizon_days: int = 7,
    evaluation_days: int = 30,
    minimum_training_days: int = 14,
) -> dict:
    """
    Evaluate multi-day moving-average forecasts using rolling origins.

    Each forecast uses only demand recorded before its forecast origin.
    A forecast is scored only when all target dates have recorded demand.
    Missing dates are never assumed to have zero demand.
    """

    if not 1 <= horizon_days <= 30:
        raise ValueError("horizon_days must be between 1 and 30")

    if not 1 <= evaluation_days <= 90:
        raise ValueError("evaluation_days must be between 1 and 90")

    if minimum_training_days < 2:
        raise ValueError("minimum_training_days must be at least 2")

    today = date.today()

    # Create evaluation_days forecast origins, each with a complete
    # horizon ending no later than today.
    first_origin = today - timedelta(
        days=evaluation_days + horizon_days - 1
    )

    last_origin = today - timedelta(days=horizon_days)

    history_start = first_origin - timedelta(days=28)

    rows = db.execute(
        select(
            DemandHistory.demand_date,
            func.sum(DemandHistory.units_requested),
        )
        .where(
            DemandHistory.facility_id == facility_id,
            DemandHistory.blood_group == blood_group,
            DemandHistory.component == component,
            DemandHistory.demand_date.between(history_start, today),
        )
        .group_by(DemandHistory.demand_date)
        .order_by(DemandHistory.demand_date)
    ).all()

    actual_by_date = {
        demand_date: float(total or 0)
        for demand_date, total in rows
    }

    facility_simulated = db.scalar(
        select(Facility.simulated).where(Facility.id == facility_id)
    )

    results = []
    skipped_incomplete = 0
    skipped_insufficient_history = 0

    for offset in range(evaluation_days):
        origin = first_origin + timedelta(days=offset)

        training_start = origin - timedelta(days=28)

        training_values = [
            units
            for demand_date, units in actual_by_date.items()
            if training_start <= demand_date < origin
        ]

        if len(training_values) < minimum_training_days:
            skipped_insufficient_history += 1
            continue

        target_dates = [
            origin + timedelta(days=day)
            for day in range(1, horizon_days + 1)
        ]

        # Require recorded demand for every day in the target horizon.
        if not all(day in actual_by_date for day in target_dates):
            skipped_incomplete += 1
            continue

        daily_average = sum(training_values) / len(training_values)
        predicted = daily_average * horizon_days
        actual = sum(actual_by_date[day] for day in target_dates)

        results.append({
            "origin_date": origin.isoformat(),
            "target_start": target_dates[0].isoformat(),
            "target_end": target_dates[-1].isoformat(),
            "training_observed_days": len(training_values),
            "predicted_demand": round(predicted, 2),
            "actual_demand": round(actual, 2),
            "absolute_error": round(abs(predicted - actual), 2),
        })

    if not results:
        return {
            "available": False,
            "reason": "Insufficient complete historical windows for backtesting.",
            "evaluation_count": 0,
            "skipped_incomplete_windows": skipped_incomplete,
            "skipped_insufficient_history": skipped_insufficient_history,
            "mae": None,
            "rmse": None,
            "wape": None,
            "model": "trailing_28_day_daily_average",
            "synthetic_data": facility_simulated,
            "results": [],
        }

    absolute_errors = [
        item["absolute_error"] for item in results
    ]

    squared_errors = [
        error ** 2 for error in absolute_errors
    ]

    total_actual = sum(
        item["actual_demand"] for item in results
    )

    total_absolute_error = sum(absolute_errors)

    return {
        "available": True,
        "reason": None,
        "evaluation_count": len(results),
        "skipped_incomplete_windows": skipped_incomplete,
        "skipped_insufficient_history": skipped_insufficient_history,
        "mae": round(
            sum(absolute_errors) / len(absolute_errors), 3
        ),
        "rmse": round(
            sqrt(sum(squared_errors) / len(squared_errors)), 3
        ),
        "wape": (
            round(total_absolute_error / total_actual * 100, 2)
            if total_actual > 0
            else None
        ),
        "model": "trailing_28_day_daily_average",
        "synthetic_data": facility_simulated,
        "results": results,
    }
