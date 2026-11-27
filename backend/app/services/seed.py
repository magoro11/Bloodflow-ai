from datetime import date, timedelta
import math

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import BloodUnit, DemandHistory, Facility, User


def seed_demo_data(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(Facility)):
        return
    today = date.today()
    facilities = [
        Facility(name="Nairobi Central Blood Centre", county="Nairobi", facility_type="Blood bank", latitude=-1.2864, longitude=36.8172, daily_demand=3, safety_stock=4),
        Facility(name="Kisumu County Referral Hospital", county="Kisumu", facility_type="Referral hospital", latitude=-0.0917, longitude=34.7680, daily_demand=4, safety_stock=5),
        Facility(name="Nakuru Regional Hospital", county="Nakuru", facility_type="Regional hospital", latitude=-0.3031, longitude=36.0800, daily_demand=2, safety_stock=3),
    ]
    db.add_all(facilities)
    db.flush()
    demo_users = [
        ("admin@bloodflow.demo", "DemoAdmin!2026", "network_administrator", None),
        ("manager@bloodflow.demo", "DemoManager!2026", "blood_bank_manager", facilities[0].id),
        ("officer@bloodflow.demo", "DemoOfficer!2026", "hospital_inventory_officer", facilities[0].id),
        ("analyst@bloodflow.demo", "DemoAnalyst!2026", "read_only_analyst", None),
    ]
    db.add_all(
        User(email=email, password_hash=hash_password(password), role=role, facility_id=facility_id)
        for email, password, role, facility_id in demo_users
    )
    products = (("red_blood_cells", 35), ("platelets", 7))
    for facility_index, facility in enumerate(facilities):
        for group_index, blood_group in enumerate(("O+", "A+", "B+", "AB+")):
            for component, shelf_life in products:
                # The Kisumu O+ red-cell combination is the deliberate demo shortage.
                count = 2 if facility_index == 1 and blood_group == "O+" and component == "red_blood_cells" else 32 + facility_index * 3
                for unit_index in range(count):
                    age = (unit_index * 3 + group_index * 2) % shelf_life
                    db.add(
                        BloodUnit(
                            facility_id=facility.id,
                            blood_group=blood_group,
                            component=component,
                            collection_date=today - timedelta(days=age),
                            expiry_date=today + timedelta(days=max(1, shelf_life - age)),
                        )
                    )
                for day_offset in range(90):
                    weekday_factor = 1.25 if (today - timedelta(days=day_offset)).weekday() in (0, 4) else 0.9
                    seasonal = 1 + 0.15 * math.sin((day_offset + facility_index * 13) / 18)
                    demand = max(0, round(facility.daily_demand * weekday_factor * seasonal / (group_index + 1)))
                    db.add(
                        DemandHistory(
                            facility_id=facility.id,
                            blood_group=blood_group,
                            component=component,
                            demand_date=today - timedelta(days=day_offset),
                            units_requested=demand,
                        )
                    )
    db.commit()
