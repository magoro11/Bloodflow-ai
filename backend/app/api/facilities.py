from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_roles
from app.database import get_db
from app.models import Facility, User
from app.schemas import FacilityIn, FacilityOut

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


@router.get("", response_model=list[FacilityOut])
def list_facilities(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return list(db.scalars(select(Facility).order_by(Facility.name)))


@router.post("", response_model=FacilityOut, status_code=status.HTTP_201_CREATED)
def create_facility(
    payload: FacilityIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("network_administrator")),
):
    facility = Facility(**payload.model_dump(), simulated=False)
    db.add(facility)
    db.commit()
    db.refresh(facility)
    return facility
