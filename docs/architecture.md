# Architecture

BloodFlow AI is a prototype decision-support layer, not a replacement for
Kenya's national blood information systems and not an existing Damu-KE
integration.

## Components

- `frontend/`: Next.js App Router dashboard, login, inventory/alerts/facility/
  forecast/transfer views, Recharts demand visualization, and a Leaflet /
  OpenStreetMap facility map.
- `backend/`: FastAPI REST API, Pydantic request/response validation, SQLAlchemy
  models, role checks, signed bearer tokens, and inventory/forecast/transfer
  services.
- `ai-engine/`: reserved for future offline model training. The current API
  forecast is a simple moving-average baseline, not a trained ML model.
- `infrastructure/`: local Dockerfiles and Compose configuration.

The API persists to SQLite by default for local setup and accepts a PostgreSQL
URL for containerized use. Synthetic demo data is inserted once when the
database is empty and `SEED_DEMO_DATA=true`.

## Data flow

The dashboard authenticates with `/api/auth/login` and sends a bearer token
with protected API calls. The backend derives the user role from a
server-signed token and checks permissions at the route boundary. Inventory
eligibility is calculated server-side; stock is eligible only when released,
not reserved, not expired, and not flagged for a cold-chain breach.

Forecast output compares a trailing synthetic-demand average against eligible
stock for a requested horizon. A transfer recommendation considers destination
shortage and source surplus after forecast demand and that facility's
configured safety stock are preserved.
Recommendation creation does not reserve stock. An authorized manager or
administrator must explicitly approve; approval reserves eligible units and
creates an audit record. Completion moves those reserved unit records to the
destination and records completion.

## Deployment boundary

Compose runs PostgreSQL, the API, and the frontend. The default local API uses
SQLite, a development-only signing key, and seeded credentials; production
deployment must replace the signing key, disable demo seeding, add a controlled
account lifecycle, configure TLS and backups, and implement reviewed
migrations plus concurrency stress testing for the transfer workflow.
