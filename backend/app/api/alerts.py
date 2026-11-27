from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models import Facility, User
from app.services.forecasting import moving_average_forecast
from app.services.inventory import near_expiry

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def list_alerts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    facilities_query = select(Facility)
    if user.role == "hospital_inventory_officer" and user.facility_id:
        facilities_query = facilities_query.where(Facility.id == user.facility_id)
    facilities = list(db.scalars(facilities_query.order_by(Facility.name)))
    alerts = []
    for facility in facilities:
        for blood_group in ("O+", "A+"):
            for component in ("red_blood_cells", "platelets"):
                forecast = moving_average_forecast(db, facility.id, blood_group, component, 7)
                if forecast["eligible_stock"] < forecast["predicted_demand"]:
                    stock = forecast["eligible_stock"]
                    average = forecast["daily_average"]
                    alerts.append(
                        {
                            "id": f"{facility.id}:{blood_group}:{component}",
                            "facility_id": facility.id,
                            "facility_name": facility.name,
                            "blood_group": blood_group,
                            "component": component,
                            "risk_level": "critical" if stock == 0 else "high",
                            "eligible_stock": stock,
                            "expected_demand_7d": forecast["predicted_demand"],
                            "shortage_in_days": max(0, int(stock / average)) if average else None,
                            "explanation": "Seven-day moving-average demand exceeds eligible stock; quarantined and unreleased units are excluded.",
                            "suggested_action": "Review a NetworkLink transfer recommendation with an authorized manager.",
                            "synthetic_data": True,
                        }
                    )
    expiring_by_product = {}
    for unit in near_expiry(db, 7):
        facility = db.get(Facility, unit.facility_id)
        if facility and (user.role != "hospital_inventory_officer" or facility.id == user.facility_id):
            key = (facility.id, facility.name, unit.blood_group, unit.component)
            expiring_by_product.setdefault(key, []).append(unit)
    for (facility_id, facility_name, blood_group, component), units in expiring_by_product.items():
        soonest_expiry = min(unit.expiry_date for unit in units)
        alerts.append(
            {
                "id": f"expiry:{facility_id}:{blood_group}:{component}",
                "facility_id": facility_id,
                "facility_name": facility_name,
                "blood_group": blood_group,
                "component": component,
                "risk_level": "expiry",
                "eligible_stock": len(units),
                "expected_demand_7d": 0,
                "shortage_in_days": None,
                "explanation": f"{len(units)} eligible units expire in the next 7 days; soonest expiry is {soonest_expiry.isoformat()}.",
                "suggested_action": "Review the units' allocation and expiry in the inventory system.",
                "synthetic_data": True,
            }
        )
    return alerts
