# API

FastAPI publishes OpenAPI at `/docs` and `/openapi.json`. Protected routes take
`Authorization: Bearer <access_token>`. Validation errors use FastAPI's
structured 4xx responses.

## Implemented routes

| Method | Path | Access |
|---|---|---|
| `POST` | `/api/auth/register` | Public; new accounts receive a read-only role pending administrator provisioning |
| `POST` | `/api/auth/login` | Public |
| `GET` | `/api/auth/me` | Authenticated |
| `GET`, `POST` | `/api/facilities` | Authenticated; create is network-admin only |
| `GET` | `/api/inventory/units` | Authenticated, supports facility/product and limit/offset filters |
| `POST` | `/api/inventory/units` | Inventory officer, manager, or network admin |
| `GET` | `/api/inventory/summary` | Authenticated |
| `GET` | `/api/forecasts?facility_id=...&blood_group=O%2B&component=red_blood_cells&horizon_days=7` | Authenticated |
| `GET` | `/api/alerts` | Authenticated |
| `GET`, `POST` | `/api/transfers` and `/api/transfers/recommend` | Authenticated; managers use their assigned source, network admins provide `source_facility_id` |
| `POST` | `/api/transfers/{id}/approve` | Blood-bank manager or network admin |
| `POST` | `/api/transfers/{id}/complete` | Blood-bank manager or network admin |
| `GET` | `/api/analytics/network` | Authenticated |
| `GET` | `/api/analytics/workspace` | Authenticated; date, facility, county, blood-group, component, and 7/14/30-day forecast filters |
| `GET` | `/api/analytics/preview` | Public; aggregate simulated metrics only, no facility or user identifiers |
| `GET`, `POST` | `/api/temperature-events` | Authenticated; reporting a breach immediately quarantines its unit |
| `GET` | `/health` | Public |

All forecast results and seeded records are labeled synthetic. Transfer
recommendation and approval are distinct operations; there is no automated
dispatch. CSV import and complete pagination metadata are not implemented.

The analytics workspace reports a historical-variability band around its
moving-average baseline; this is not a calibrated prediction interval.
Historical predictions are not stored, so MAE, RMSE, and WAPE are unavailable.
Historical stock snapshots, wastage events, and a rejected-transfer state are
also not recorded; charts use current eligible inventory and supported transfer
statuses.
