from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models import Facility, User
from app.schemas import BloodGroup, Component, ForecastOut
from app.services.forecasting import moving_average_forecast

router = APIRouter(prefix="/api/forecasts", tags=["forecasts"])


@router.get("", response_model=ForecastOut)
def forecast(
    facility_id: str,
    blood_group: BloodGroup = "O+",
    component: Component = "red_blood_cells",
    horizon_days: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role in ("blood_bank_manager", "hospital_inventory_officer") and user.facility_id != facility_id:
        raise HTTPException(status_code=403, detail="Cannot access another facility's forecast")
    if db.get(Facility, facility_id) is None:
        raise HTTPException(status_code=404, detail="Facility not found")
    return moving_average_forecast(db, facility_id, blood_group, component, horizon_days)
