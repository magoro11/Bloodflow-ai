from app.services.backtesting import backtest_moving_average
from app.models import BloodUnit, DemandHistory, Facility
from app.services.forecasting import moving_average_forecast

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app import database
from app.database import Base
from app.main import create_app
from app.models import BloodUnit
from app.services.seed import seed_demo_data


@pytest.fixture()
def client(tmp_path):
    database.configure_database(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.drop_all(bind=database.engine)
    Base.metadata.create_all(bind=database.engine)
    with database.SessionLocal() as db:
        seed_demo_data(db)
    with TestClient(create_app(seed_demo_enabled=False)) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=database.engine)


def login(client: TestClient, email="manager@bloodflow.demo", password="DemoManager!2026") -> str:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_login_rejects_bad_password_and_protects_network(client):
    bad_login = client.post("/api/auth/login", json={"email": "manager@bloodflow.demo", "password": "wrong"})
    assert bad_login.status_code == 401
    assert client.get("/api/facilities").status_code == 401
    assert client.get("/api/facilities", headers={"Authorization": f"Bearer {login(client)}"}).status_code == 200


def test_local_frontend_origins_are_allowed(client):
    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://127.0.0.1:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"


def test_registration_cannot_assign_privileged_role(client):
    response = client.post(
        "/api/auth/register",
        json={
            "email": "new.person@example.com",
            "password": "LongEnoughPassword!42",
            "role": "network_administrator",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "read_only_analyst"


def test_registered_account_can_sign_in_and_duplicate_email_is_rejected(client):
    registration = client.post(
        "/api/auth/register",
        json={"email": "New.Person@example.com", "password": "LongEnoughPassword!42"},
    )
    assert registration.status_code == 201
    assert registration.json()["email"] == "new.person@example.com"
    assert registration.json()["role"] == "read_only_analyst"

    duplicate = client.post(
        "/api/auth/register",
        json={"email": "NEW.PERSON@EXAMPLE.COM", "password": "LongEnoughPassword!42"},
    )
    assert duplicate.status_code == 409

    signed_in = client.post(
        "/api/auth/login",
        json={"email": "NEW.PERSON@EXAMPLE.COM", "password": "LongEnoughPassword!42"},
    )
    assert signed_in.status_code == 200
    profile = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {signed_in.json()['access_token']}"},
    )
    assert profile.status_code == 200
    assert profile.json()["email"] == "new.person@example.com"
    assert profile.json()["role"] == "read_only_analyst"


def test_only_eligible_units_count_and_cold_chain_breach_is_quarantined(client):
    token = login(client)
    facilities = client.get("/api/facilities", headers={"Authorization": f"Bearer {token}"}).json()
    facility_id = next(item["id"] for item in facilities if item["county"] == "Nairobi")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "facility_id": facility_id,
        "blood_group": "O+",
        "component": "red_blood_cells",
        "collection_date": date.today().isoformat(),
        "expiry_date": (date.today() + timedelta(days=14)).isoformat(),
        "cold_chain_status": "breach",
    }
    initial = client.get("/api/analytics/network", headers=headers).json()["eligible_units"]
    created = client.post("/api/inventory/units", json=payload, headers=headers)
    assert created.status_code == 201
    assert created.json()["screening_status"] == "quarantined"
    summary = client.get("/api/analytics/network", headers=headers).json()
    assert summary["eligible_units"] == initial


def test_transfer_requires_authorized_human_approval_and_reserves_units(client):
    manager_token = login(client)
    headers = {"Authorization": f"Bearer {manager_token}"}
    facilities = client.get("/api/facilities", headers=headers).json()
    destination_id = next(item["id"] for item in facilities if item["county"] == "Kisumu")
    recommendation = client.post(
        "/api/transfers/recommend",
        headers=headers,
        json={"destination_facility_id": destination_id, "blood_group": "O+", "component": "red_blood_cells", "units": 3},
    )
    assert recommendation.status_code == 201
    transfer = recommendation.json()
    assert transfer["status"] == "recommended"
    duplicate = client.post(
        "/api/transfers/recommend",
        headers=headers,
        json={"destination_facility_id": destination_id, "blood_group": "O+", "component": "red_blood_cells", "units": 1},
    )
    assert duplicate.status_code == 400

    officer_token = login(client, "officer@bloodflow.demo", "DemoOfficer!2026")
    rejected = client.post(
        f"/api/transfers/{transfer['id']}/approve",
        headers={"Authorization": f"Bearer {officer_token}"},
    )
    assert rejected.status_code == 403

    approved = client.post(f"/api/transfers/{transfer['id']}/approve", headers=headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    completed = client.post(f"/api/transfers/{transfer['id']}/complete", headers=headers)
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    assert client.get("/api/analytics/network", headers=headers).json()["eligible_units"] > 0


def test_network_admin_can_choose_an_explicit_source_facility(client):
    token = login(client, "admin@bloodflow.demo", "DemoAdmin!2026")
    headers = {"Authorization": f"Bearer {token}"}
    facilities = client.get("/api/facilities", headers=headers).json()
    source_id = next(item["id"] for item in facilities if item["county"] == "Nairobi")
    destination_id = next(item["id"] for item in facilities if item["county"] == "Kisumu")
    response = client.post(
        "/api/transfers/recommend",
        headers=headers,
        json={
            "source_facility_id": source_id,
            "destination_facility_id": destination_id,
            "blood_group": "O+",
            "component": "red_blood_cells",
            "units": 2,
        },
    )
    assert response.status_code == 201
    assert response.json()["source_facility_id"] == source_id


def test_analytics_workspace_aggregates_seeded_data_and_enforces_facility_scope(client):
    headers = {"Authorization": f"Bearer {login(client)}"}
    facilities = client.get("/api/facilities", headers=headers).json()
    nairobi_id = next(item["id"] for item in facilities if item["county"] == "Nairobi")
    kisumu_id = next(item["id"] for item in facilities if item["county"] == "Kisumu")
    today = date.today()
    response = client.get(
        "/api/analytics/workspace",
        headers=headers,
        params={
            "date_from": (today - timedelta(days=29)).isoformat(),
            "date_to": today.isoformat(),
            "facility_id": nairobi_id,
            "blood_group": "O+",
            "component": "red_blood_cells",
            "horizon_days": 14,
        },
    )
    assert response.status_code == 200, response.text
    workspace = response.json()
    assert workspace["summary"]["facility_count"] == 1
    assert workspace["summary"]["history_days_with_data"] == 30
    matching_units = client.get(
        "/api/inventory/units",
        headers=headers,
        params={
            "facility_id": nairobi_id,
            "blood_group": "O+",
            "component": "red_blood_cells",
            "limit": 500,
        },
    ).json()
    expected_eligible = sum(
        unit["screening_status"] == "released"
        and unit["reservation_status"] == "available"
        and unit["cold_chain_status"] == "normal"
        and unit["expiry_date"] >= today.isoformat()
        for unit in matching_units
    )
    assert workspace["summary"]["eligible_units"] == expected_eligible
    assert len(workspace["forecast_series"]) == 44
    assert len(workspace["blood_group_distribution"]) == 8
    assert len(workspace["component_distribution"]) == 4
    assert workspace["forecast_quality"]["mae"] is None
    assert workspace["forecast_quality"]["available"] is False
    assert "not a model confidence interval" in workspace["forecast_interval_method"]

    forbidden = client.get(
        "/api/analytics/workspace",
        headers=headers,
        params={"facility_id": kisumu_id},
    )
    assert forbidden.status_code == 403
    future_range = client.get(
        "/api/analytics/workspace",
        headers=headers,
        params={"date_to": (today + timedelta(days=1)).isoformat()},
    )
    assert future_range.status_code == 422


def test_public_analytics_preview_contains_only_aggregated_demo_metrics(client):
    preview = client.get("/api/analytics/preview")
    assert preview.status_code == 200
    data = preview.json()
    assert data["synthetic_data"] is True
    assert data["summary"]["facility_count"] == 3
    assert len(data["blood_group_distribution"]) == 8
    assert len(data["demand_series"]) == 14
    assert all("facility_id" not in point for point in data["demand_series"])


def test_cold_chain_breach_blocks_approved_transfer_and_releases_other_reservations(client):
    token = login(client)
    headers = {"Authorization": f"Bearer {token}"}
    facilities = client.get("/api/facilities", headers=headers).json()
    destination_id = next(item["id"] for item in facilities if item["county"] == "Kisumu")
    recommendation = client.post(
        "/api/transfers/recommend",
        headers=headers,
        json={"destination_facility_id": destination_id, "blood_group": "O+", "component": "red_blood_cells", "units": 3},
    ).json()
    approved = client.post(f"/api/transfers/{recommendation['id']}/approve", headers=headers)
    assert approved.status_code == 200
    reserved = client.get(
        "/api/inventory/units",
        headers=headers,
        params={"blood_group": "O+", "component": "red_blood_cells", "limit": 100},
    ).json()
    reserved_unit = next(unit for unit in reserved if unit["transfer_id"] == recommendation["id"])
    breach = client.post(
        "/api/temperature-events",
        headers=headers,
        json={"unit_id": reserved_unit["id"], "temperature_c": 9.0, "notes": "Simulated transfer excursion"},
    )
    assert breach.status_code == 201
    blocked = client.get("/api/transfers", headers=headers).json()
    assert next(item for item in blocked if item["id"] == recommendation["id"])["status"] == "blocked"
    refreshed = client.get(
        "/api/inventory/units",
        headers=headers,
        params={"blood_group": "O+", "component": "red_blood_cells", "limit": 100},
    ).json()
    assert sum(unit["reservation_status"] == "reserved" and unit["transfer_id"] == recommendation["id"] for unit in refreshed) == 0


def test_temperature_breach_quarantines_unit_and_requires_human_review(client):
    token = login(client)
    headers = {"Authorization": f"Bearer {token}"}
    units = client.get(
        "/api/inventory/units",
        headers=headers,
        params={"blood_group": "O+", "component": "red_blood_cells", "limit": 1},
    ).json()
    unit = units[0]
    event = client.post(
        "/api/temperature-events",
        headers=headers,
        json={"unit_id": unit["id"], "temperature_c": 9.0, "notes": "Simulated excursion event"},
    )
    assert event.status_code == 201
    assert event.json()["status"] == "quarantined_review_required"
    refreshed = client.get(
        "/api/inventory/units",
        headers=headers,
        params={"blood_group": "O+", "component": "red_blood_cells", "limit": 100},
    ).json()
    breached_unit = next(item for item in refreshed if item["id"] == unit["id"])
    assert breached_unit["screening_status"] == "quarantined"
    assert breached_unit["cold_chain_status"] == "breach"
    assert client.post(f"/api/temperature-events/{event.json()['id']}/clear", headers=headers).status_code == 404


def test_forecast_validation_and_demo_shortage_alert(client):
    token = login(client)
    headers = {"Authorization": f"Bearer {token}"}
    facilities = client.get("/api/facilities", headers=headers).json()
    kisumu_id = next(item["id"] for item in facilities if item["county"] == "Kisumu")
    response = client.get(
        "/api/forecasts",
        headers=headers,
        params={"facility_id": kisumu_id, "blood_group": "O+", "component": "red_blood_cells", "horizon_days": 7},
    )
    assert response.status_code == 403
    admin = login(client, "admin@bloodflow.demo", "DemoAdmin!2026")
    forecast = client.get(
        "/api/forecasts",
        headers={"Authorization": f"Bearer {admin}"},
        params={"facility_id": kisumu_id, "blood_group": "O+", "component": "red_blood_cells", "horizon_days": 7},
    )
    assert forecast.status_code == 200
    assert forecast.json()["shortage_expected"] is True
    assert forecast.json()["synthetic_data"] is True
    alerts = client.get("/api/alerts", headers={"Authorization": f"Bearer {admin}"}).json()
    assert len(alerts) < 50
    assert any(item["risk_level"] == "expiry" and item["eligible_stock"] > 1 for item in alerts)

def test_forecast_aggregates_multiple_records_on_same_day(client):
    with database.SessionLocal() as db:
        facility = db.query(Facility).filter_by(name="Nairobi Central Blood Centre").first()
        assert facility is not None

        today = date.today()

        db.add_all([
            DemandHistory(
                facility_id=facility.id,
                blood_group="O+",
                component="red_blood_cells",
                demand_date=today,
                units_requested=10,
            ),
            DemandHistory(
                facility_id=facility.id,
                blood_group="O+",
                component="red_blood_cells",
                demand_date=today,
                units_requested=20,
            ),
        ])
        db.commit()

        result = moving_average_forecast(
            db, facility.id, "O+", "red_blood_cells", 7
        )

        # Seeded records also exist, so this test checks that the
        # duplicate records are included in the daily total.
        assert result["daily_average"] > 0
        assert result["model"] == "trailing_28_day_daily_average"


def test_forecast_ignores_demand_older_than_28_days(client):
    with database.SessionLocal() as db:
        facility = db.query(Facility).filter_by(name="Nairobi Central Blood Centre").first()
        assert facility is not None

        old_date = date.today() - timedelta(days=40)

        db.add(DemandHistory(
            facility_id=facility.id,
            blood_group="O+",
            component="red_blood_cells",
            demand_date=old_date,
            units_requested=10000,
        ))
        db.commit()

        result = moving_average_forecast(
            db, facility.id, "O+", "red_blood_cells", 7
        )

        assert result["daily_average"] < 10000


def test_forecast_does_not_treat_missing_dates_as_zero(client):
    with database.SessionLocal() as db:
        facility = db.query(Facility).filter_by(name="Nairobi Central Blood Centre").first()
        assert facility is not None

        result = moving_average_forecast(
            db, facility.id, "O+", "red_blood_cells", 7
        )

        # The seeded dataset has recorded demand on each of the
        # most recent 28 dates. The result should remain positive.
        assert result["daily_average"] > 0
        assert result["predicted_demand"] > 0


def test_backtest_compares_forecast_with_full_horizon_actual(client):
    from datetime import date, timedelta

    with database.SessionLocal() as db:
        facility = db.query(Facility).first()
        assert facility is not None

        group = "A+"
        component = "red_blood_cells"
        today = date.today()

        db.query(DemandHistory).filter(
            DemandHistory.facility_id == facility.id,
            DemandHistory.blood_group == group,
            DemandHistory.component == component,
        ).delete(synchronize_session=False)

        first_origin = today - timedelta(days=9)
        history_start = first_origin - timedelta(days=28)

        records = []

        for offset in range((today - history_start).days + 1):
            demand_date = history_start + timedelta(days=offset)

            # Training demand is 2 units per day.
            # Evaluation-period demand is 4 units per day.
            units = 4 if demand_date >= today - timedelta(days=8) else 2

            records.append(
                DemandHistory(
                    facility_id=facility.id,
                    blood_group=group,
                    component=component,
                    demand_date=demand_date,
                    units_requested=units,
                )
            )

        db.add_all(records)
        db.commit()

        result = backtest_moving_average(
            db=db,
            facility_id=facility.id,
            blood_group=group,
            component=component,
            horizon_days=7,
            evaluation_days=3,
            minimum_training_days=14,
        )

        assert result["available"] is True
        assert result["evaluation_count"] == 3

        # 2 units/day x 7 days = 14 predicted units.
        assert result["results"][0]["predicted_demand"] == 14

        # 4 units/day x 7 days = 28 actual units.
        assert result["results"][0]["actual_demand"] == 28

        assert result["mae"] == 13.833
        assert result["wape"] == 49.4
        assert result["rmse"] == 13.835


def test_backtest_skips_incomplete_target_windows(client):
    from datetime import date, timedelta

    with database.SessionLocal() as db:
        facility = db.query(Facility).first()
        assert facility is not None

        group = "A+"
        component = "red_blood_cells"
        today = date.today()

        db.query(DemandHistory).filter(
            DemandHistory.facility_id == facility.id,
            DemandHistory.blood_group == group,
            DemandHistory.component == component,
        ).delete(synchronize_session=False)

        first_origin = today - timedelta(days=9)
        history_start = first_origin - timedelta(days=28)

        # Provide training history, but no target-period observations.
        records = [
            DemandHistory(
                facility_id=facility.id,
                blood_group=group,
                component=component,
                demand_date=history_start + timedelta(days=offset),
                units_requested=2,
            )
            for offset in range(28)
        ]

        db.add_all(records)
        db.commit()

        result = backtest_moving_average(
            db=db,
            facility_id=facility.id,
            blood_group=group,
            component=component,
            horizon_days=7,
            evaluation_days=3,
            minimum_training_days=14,
        )

        assert result["available"] is False
        assert result["evaluation_count"] == 0
        assert result["skipped_incomplete_windows"] == 3
        assert result["mae"] is None


def test_backtest_returns_unavailable_with_insufficient_training_history(client):
    from datetime import date, timedelta

    with database.SessionLocal() as db:
        facility = db.query(Facility).first()
        assert facility is not None

        group = "A+"
        component = "red_blood_cells"
        today = date.today()

        db.query(DemandHistory).filter(
            DemandHistory.facility_id == facility.id,
            DemandHistory.blood_group == group,
            DemandHistory.component == component,
        ).delete(synchronize_session=False)

        first_origin = today - timedelta(days=9)
        history_start = first_origin - timedelta(days=28)

        # Only 10 historical observations: below the required 14.
        records = [
            DemandHistory(
                facility_id=facility.id,
                blood_group=group,
                component=component,
                demand_date=history_start + timedelta(days=offset),
                units_requested=2,
            )
            for offset in range(10)
        ]

        db.add_all(records)
        db.commit()

        result = backtest_moving_average(
            db=db,
            facility_id=facility.id,
            blood_group=group,
            component=component,
            horizon_days=7,
            evaluation_days=3,
            minimum_training_days=14,
        )

        assert result["available"] is False
        assert result["evaluation_count"] == 0
        assert result["skipped_insufficient_history"] == 3
        assert result["mae"] is None
        assert result["rmse"] is None
        assert result["wape"] is None


@pytest.mark.parametrize("horizon_days", [7, 14, 30])
def test_backtest_supports_different_forecast_horizons(client, horizon_days):
    from datetime import date, timedelta

    with database.SessionLocal() as db:
        facility = db.query(Facility).first()
        assert facility is not None

        result = backtest_moving_average(
            db=db,
            facility_id=facility.id,
            blood_group="A+",
            component="red_blood_cells",
            horizon_days=horizon_days,
            evaluation_days=3,
            minimum_training_days=14,
        )

        assert result["available"] is True
        assert result["evaluation_count"] == 3

        for item in result["results"]:
            start = date.fromisoformat(item["target_start"])
            end = date.fromisoformat(item["target_end"])

            assert (end - start).days + 1 == horizon_days

def test_backtest_endpoint_returns_forecast_metrics(client):
    admin = login(client, "admin@bloodflow.demo", "DemoAdmin!2026")
    headers = {"Authorization": f"Bearer {admin}"}

    facilities = client.get(
        "/api/facilities",
        headers=headers,
    ).json()

    facility_id = facilities[0]["id"]

    response = client.get(
        "/api/forecasts/backtest",
        headers=headers,
        params={
            "facility_id": facility_id,
            "blood_group": "O+",
            "component": "red_blood_cells",
            "horizon_days": 7,
            "evaluation_days": 30,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["available"] is True
    assert data["evaluation_count"] > 0
    assert data["mae"] is not None
    assert data["rmse"] is not None
    assert data["model"] == "trailing_28_day_daily_average"
    assert len(data["results"]) == data["evaluation_count"]

def test_backtest_endpoint_rejects_cross_facility_access(client):
    token = login(client)
    headers = {"Authorization": f"Bearer {token}"}

    facilities = client.get(
        "/api/facilities",
        headers=headers,
    ).json()

    kisumu_id = next(
        item["id"]
        for item in facilities
        if item["county"] == "Kisumu"
    )

    response = client.get(
        "/api/forecasts/backtest",
        headers=headers,
        params={"facility_id": kisumu_id},
    )

    assert response.status_code == 403


def test_backtest_endpoint_requires_authentication(client):
    response = client.get(
        "/api/forecasts/backtest",
        params={"facility_id": "test-facility"},
    )

    assert response.status_code == 401
