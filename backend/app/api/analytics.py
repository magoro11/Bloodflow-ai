from datetime import date, timedelta
from statistics import pstdev

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models import BloodUnit, DemandHistory, Facility, TransferRequest, User
from app.schemas import BloodGroup, Component

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

BLOOD_GROUPS: tuple[BloodGroup, ...] = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
COMPONENTS: tuple[Component, ...] = ("whole_blood", "red_blood_cells", "platelets", "plasma")


@router.get("/network")
def network_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    facility_query = select(Facility)
    if user.role == "hospital_inventory_officer" and user.facility_id:
        facility_query = facility_query.where(Facility.id == user.facility_id)
    facilities = list(db.scalars(facility_query))
    facility_ids = [facility.id for facility in facilities]
    stock_conditions = (
        BloodUnit.facility_id.in_(facility_ids),
        BloodUnit.screening_status == "released",
        BloodUnit.reservation_status == "available",
        BloodUnit.cold_chain_status == "normal",
        BloodUnit.expiry_date >= date.today(),
    )
    count = db.scalar(select(func.count(BloodUnit.id)).where(*stock_conditions)) or 0
    expiring = db.scalar(
        select(func.count(BloodUnit.id)).where(
            *stock_conditions,
            BloodUnit.expiry_date <= date.today() + timedelta(days=7),
        )
    ) or 0
    return {
        "facility_count": len(facilities),
        "eligible_units": count,
        "simulated_facilities": sum(facility.simulated for facility in facilities),
        "near_expiry_units": expiring,
        "synthetic_data": True,
    }


@router.get("/preview")
def public_analytics_preview(db: Session = Depends(get_db)):
    today = date.today()
    facilities = list(db.scalars(select(Facility.id)))
    facility_ids = [item for item in facilities]
    stock_conditions = (
        BloodUnit.facility_id.in_(facility_ids),
        BloodUnit.screening_status == "released",
        BloodUnit.reservation_status == "available",
        BloodUnit.cold_chain_status == "normal",
        BloodUnit.expiry_date >= today,
    )
    eligible_units = (
        db.scalar(select(func.count(BloodUnit.id)).where(*stock_conditions)) or 0
        if facility_ids
        else 0
    )
    near_expiry_units = (
        db.scalar(
            select(func.count(BloodUnit.id)).where(
                *stock_conditions,
                BloodUnit.expiry_date <= today + timedelta(days=7),
            )
        )
        or 0
        if facility_ids
        else 0
    )
    group_rows = (
        db.execute(
            select(BloodUnit.blood_group, func.count(BloodUnit.id))
            .where(*stock_conditions)
            .group_by(BloodUnit.blood_group)
        )
        if facility_ids
        else []
    )
    group_counts = {group: int(count) for group, count in group_rows}
    start_date = today - timedelta(days=13)
    demand_rows = db.execute(
        select(DemandHistory.demand_date, func.sum(DemandHistory.units_requested))
        .where(DemandHistory.demand_date.between(start_date, today))
        .group_by(DemandHistory.demand_date)
        .order_by(DemandHistory.demand_date)
    )
    daily_demand = {day: int(units or 0) for day, units in demand_rows}
    return {
        "synthetic_data": True,
        "summary": {
            "facility_count": len(facility_ids),
            "eligible_units": eligible_units,
            "near_expiry_units": near_expiry_units,
            "forecast_history_days": db.scalar(
                select(func.count(func.distinct(DemandHistory.demand_date))).where(
                    DemandHistory.demand_date >= today - timedelta(days=89),
                    DemandHistory.demand_date <= today,
                )
            ) or 0,
            "active_transfer_recommendations": db.scalar(
                select(func.count(TransferRequest.id)).where(
                    TransferRequest.status.in_(("recommended", "approved"))
                )
            ) or 0,
        },
        "blood_group_distribution": [
            {"blood_group": group, "eligible_units": group_counts.get(group, 0)}
            for group in BLOOD_GROUPS
        ],
        "demand_series": [
            {
                "date": (start_date + timedelta(days=offset)).isoformat(),
                "actual_demand": daily_demand.get(start_date + timedelta(days=offset), 0),
            }
            for offset in range(14)
        ],
    }


@router.get("/workspace")
def analytics_workspace(
    date_from: date | None = None,
    date_to: date | None = None,
    facility_id: str | None = None,
    county: str | None = None,
    blood_group: BloodGroup | None = None,
    component: Component | None = None,
    horizon_days: int = Query(default=7, ge=7, le=30),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today()
    end_date = date_to or today
    start_date = date_from or end_date - timedelta(days=29)
    if end_date > today:
        raise HTTPException(status_code=422, detail="date_to cannot be in the future")
    if start_date > end_date:
        raise HTTPException(status_code=422, detail="date_from must be on or before date_to")
    if (end_date - start_date).days > 365:
        raise HTTPException(status_code=422, detail="Date range cannot exceed 366 days")
    if horizon_days not in (7, 14, 30):
        raise HTTPException(status_code=422, detail="horizon_days must be 7, 14, or 30")

    facility_query = select(Facility)
    if user.role in ("blood_bank_manager", "hospital_inventory_officer"):
        if not user.facility_id:
            raise HTTPException(status_code=403, detail="User has no assigned facility")
        if facility_id and facility_id != user.facility_id:
            raise HTTPException(status_code=403, detail="Cannot access another facility's analytics")
        facility_query = facility_query.where(Facility.id == user.facility_id)
    elif facility_id:
        facility_query = facility_query.where(Facility.id == facility_id)
    if county:
        facility_query = facility_query.where(Facility.county == county)

    facilities = list(db.scalars(facility_query.order_by(Facility.name)))
    facility_ids = [facility.id for facility in facilities]
    if facility_id and not facilities:
        raise HTTPException(status_code=404, detail="Facility not found")

    demand_rows = []
    if facility_ids:
        demand_query = (
            select(DemandHistory.facility_id, DemandHistory.demand_date, func.sum(DemandHistory.units_requested))
            .where(
                DemandHistory.facility_id.in_(facility_ids),
                DemandHistory.demand_date.between(start_date, end_date),
            )
        )
        if blood_group:
            demand_query = demand_query.where(DemandHistory.blood_group == blood_group)
        if component:
            demand_query = demand_query.where(DemandHistory.component == component)
        demand_rows = list(
            db.execute(
                demand_query.group_by(DemandHistory.facility_id, DemandHistory.demand_date)
                .order_by(DemandHistory.demand_date, DemandHistory.facility_id)
            )
        )

    period_dates = [
        start_date + timedelta(days=offset)
        for offset in range((end_date - start_date).days + 1)
    ]
    demand_by_facility: dict[str, dict[date, int]] = {item.id: {} for item in facilities}
    for row_facility_id, demand_date, units_requested in demand_rows:
        demand_by_facility[row_facility_id][demand_date] = int(units_requested or 0)
    observed_dates = {row[1] for row in demand_rows}
    daily_demand = [
        sum(demand_by_facility[item.id].get(day, 0) for item in facilities)
        for day in period_dates
        if day in observed_dates
    ]
    has_demand_history = bool(demand_rows)
    mean_daily_demand = sum(daily_demand) / len(daily_demand) if has_demand_history else None
    daily_variability = pstdev(daily_demand) if has_demand_history else None
    variability = daily_variability or 0.0
    forecast_series = [
        {
            "date": day.isoformat(),
            "actual_demand": (
                sum(demand_by_facility[item.id].get(day, 0) for item in facilities)
                if day in observed_dates
                else None
            ),
            "predicted_demand": None,
            "lower_bound": None,
            "upper_bound": None,
        }
        for day in period_dates
    ] if has_demand_history else []
    if has_demand_history and mean_daily_demand is not None:
        forecast_series.extend(
            {
                "date": (end_date + timedelta(days=offset)).isoformat(),
                "actual_demand": None,
                "predicted_demand": round(mean_daily_demand, 2),
                "lower_bound": round(max(0.0, mean_daily_demand - variability), 2),
                "upper_bound": round(mean_daily_demand + variability, 2),
            }
            for offset in range(1, horizon_days + 1)
        )

    units: list[BloodUnit] = []
    if facility_ids:
        inventory_query = select(BloodUnit).where(BloodUnit.facility_id.in_(facility_ids))
        if blood_group:
            inventory_query = inventory_query.where(BloodUnit.blood_group == blood_group)
        if component:
            inventory_query = inventory_query.where(BloodUnit.component == component)
        units = list(db.scalars(inventory_query))

    def inventory_status(unit: BloodUnit) -> str:
        if unit.screening_status == "quarantined" or unit.cold_chain_status == "breach":
            return "quarantined"
        if unit.reservation_status == "reserved":
            return "reserved"
        if unit.expiry_date < today:
            return "expired"
        if (
            unit.screening_status == "released"
            and unit.reservation_status == "available"
            and unit.cold_chain_status == "normal"
        ):
            return "eligible"
        return "other"

    status_counts = {key: 0 for key in ("eligible", "reserved", "quarantined", "expired", "other")}
    blood_group_counts = {key: 0 for key in BLOOD_GROUPS}
    component_counts = {
        key: {status_key: 0 for status_key in status_counts}
        for key in COMPONENTS
    }
    expiring_counts = {7: 0, 14: 0, 30: 0}
    eligible_by_facility = {item.id: 0 for item in facilities}
    for unit in units:
        status_key = inventory_status(unit)
        status_counts[status_key] += 1
        component_counts[unit.component][status_key] += 1
        if status_key == "eligible":
            blood_group_counts[unit.blood_group] += 1
            eligible_by_facility[unit.facility_id] += 1
            days_to_expiry = (unit.expiry_date - today).days
            for threshold in expiring_counts:
                if 0 <= days_to_expiry <= threshold:
                    expiring_counts[threshold] += 1

    facility_performance = []
    risk_counts = {key: 0 for key in ("critical", "high", "medium", "low", "no_history")}
    for facility in facilities:
        observed = [
            demand_by_facility[facility.id].get(day, 0)
            for day in period_dates
            if day in demand_by_facility[facility.id]
        ]
        has_facility_history = bool(observed)
        facility_daily_average = sum(observed) / len(observed) if has_facility_history else None
        stock = eligible_by_facility[facility.id]
        facility_performance.append(
            {
                "facility_id": facility.id,
                "facility_name": facility.name,
                "eligible_units": stock,
                "forecast_demand": round((facility_daily_average or 0) * horizon_days, 2),
                "has_demand_history": has_facility_history,
            }
        )
        if facility_daily_average is None:
            risk_counts["no_history"] += 1
        else:
            days_of_stock = stock / facility_daily_average if facility_daily_average > 0 else float("inf")
            risk_key = (
                "critical" if days_of_stock <= 3
                else "high" if days_of_stock <= 7
                else "medium" if days_of_stock <= 14
                else "low"
            )
            risk_counts[risk_key] += 1

    transfer_query = select(TransferRequest).order_by(TransferRequest.created_at.desc())
    if facility_ids:
        transfer_query = transfer_query.where(
            (TransferRequest.source_facility_id.in_(facility_ids))
            | (TransferRequest.destination_facility_id.in_(facility_ids))
        )
    else:
        transfer_query = transfer_query.where(False)
    transfer_records = [
        transfer
        for transfer in db.scalars(transfer_query)
        if start_date <= transfer.created_at.date() <= end_date
    ]
    transfer_statuses = ("recommended", "approved", "completed", "blocked")
    transfer_counts = {key: 0 for key in transfer_statuses}
    facility_names = {item.id: item.name for item in facilities}
    for transfer in transfer_records:
        if transfer.status in transfer_counts:
            transfer_counts[transfer.status] += 1
    recent_activity = [
        {
            "id": transfer.id,
            "description": (
                f"{transfer.units} × {transfer.blood_group} {transfer.component.replace('_', ' ')} "
                f"from {facility_names.get(transfer.source_facility_id, 'source')} "
                f"to {facility_names.get(transfer.destination_facility_id, 'destination')}"
            ),
            "status": transfer.status,
            "created_at": transfer.created_at.isoformat(),
        }
        for transfer in transfer_records[:5]
    ]

    mean_daily = mean_daily_demand or 0.0
    supply_demand = [
        {
            "day": offset,
            "date": (end_date + timedelta(days=offset)).isoformat(),
            "eligible_stock": status_counts["eligible"],
            "cumulative_forecast_demand": round(mean_daily * offset, 2),
        }
        for offset in range(1, horizon_days + 1)
    ] if has_demand_history else []

    return {
        "filters": {
            "date_from": start_date.isoformat(),
            "date_to": end_date.isoformat(),
            "facility_id": facility_id,
            "county": county,
            "blood_group": blood_group,
            "component": component,
            "horizon_days": horizon_days,
        },
        "synthetic_data": True,
        "summary": {
            "facility_count": len(facilities),
            "total_units": len(units),
            "eligible_units": status_counts["eligible"],
            "reserved_units": status_counts["reserved"],
            "quarantined_units": status_counts["quarantined"],
            "expired_units": status_counts["expired"],
            "expiring_7d": expiring_counts[7],
            "expiring_14d": expiring_counts[14],
            "expiring_30d": expiring_counts[30],
            "mean_daily_demand": round(mean_daily_demand, 2) if mean_daily_demand is not None else None,
            "history_days_with_data": len(observed_dates),
        },
        "forecast_series": forecast_series,
        "forecast_interval_method": (
            "Historical daily standard deviation around the moving average; descriptive variability band, not a model confidence interval."
        ),
        "forecast_quality": {
            "mae": None,
            "rmse": None,
            "wape": None,
            "available": False,
            "reason": "The system does not store past predictions, so forecast accuracy cannot be measured.",
        },
        "supply_demand_series": supply_demand,
        "blood_group_distribution": [
            {"blood_group": group, "eligible_units": blood_group_counts[group]}
            for group in BLOOD_GROUPS
        ],
        "component_distribution": [
            {
                "component": item,
                **component_counts[item],
            }
            for item in COMPONENTS
        ],
        "inventory_status_distribution": [
            {"status": key, "units": value}
            for key, value in status_counts.items()
        ],
        "facility_performance": facility_performance,
        "stock_coverage_distribution": [
            {"coverage_band": key, "facilities": value}
            for key, value in risk_counts.items()
        ],
        "expiry_monitoring": [
            {"horizon_days": threshold, "units": expiring_counts[threshold]}
            for threshold in (7, 14, 30)
        ],
        "transfer_activity": [
            {"status": key, "count": transfer_counts[key]}
            for key in transfer_statuses
        ],
        "recent_activity": recent_activity,
        "limitations": {
            "synthetic_data": True,
            "stock_supply_is_current_snapshot": True,
            "historical_stock_levels_available": False,
            "transfer_rejection_status_available": False,
            "wastage_events_available": False,
        },
    }
