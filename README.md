# BloodFlow AI

**Predict shortages. Connect blood banks. Save lives.**

BloodFlow AI is a simulated blood-supply intelligence MVP for Kenyan healthcare
facilities. It demonstrates inventory eligibility, a moving-average demand
baseline, shortage alerts, and a human-reviewed inventory transfer workflow. It
is a complementary prototype only: it does not integrate with Damu-KE or
replace existing national systems.

> **Safety:** This is operational decision support, not a clinical system. It
> does not make transfusion or compatibility decisions, automatically approve
> transfers, or establish clinical effectiveness. Every dataset is simulated.
> Qualified blood-bank staff must independently verify inventory, cold chain,
> and any proposed movement.

## Run locally on Windows

Requirements: Python 3.11+ and Node.js 20.9+. Docker is optional. From the
repository root, create a Python environment and run the API:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
uvicorn app.main:app --app-dir backend --reload
```

In another PowerShell window:

```powershell
Set-Location frontend
npm install
npm run dev
```

Open <http://localhost:3000> for the public homepage. After signing in, explore
the authenticated `/dashboard`, `/analytics`, `/forecasts`, and `/inventory`
workspaces. The API and interactive OpenAPI page are at
<http://localhost:8000> and <http://localhost:8000/docs>. On first API startup,
the default SQLite database is initialized and seeded with simulated demo
facilities, 90 days of sample demand history, inventory, and demo users.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Network administrator | `admin@bloodflow.demo` | `DemoAdmin!2026` |
| Blood-bank manager | `manager@bloodflow.demo` | `DemoManager!2026` |
| Inventory officer | `officer@bloodflow.demo` | `DemoOfficer!2026` |
| Read-only analyst | `analyst@bloodflow.demo` | `DemoAnalyst!2026` |

Use the manager account for the Nairobi-to-Kisumu transfer walkthrough. These
credentials and the development JWT secret are for local demonstration only.
Do not expose a seeded demo instance to the internet.

You can create an account from the sign-in page with a 12–128 character
password. Self-registered accounts receive read-only analyst access; ask an
administrator for an operational role.

## Environment

The backend reads `DATABASE_URL`, `JWT_SECRET`, `ACCESS_TOKEN_MINUTES`,
`FRONTEND_ORIGIN`, and `SEED_DEMO_DATA`. The frontend reads
`NEXT_PUBLIC_API_URL`. Copy `.env.example` to `.env` for Compose or configure
these variables in the process environment. Never reuse the documented demo
secret or passwords outside a local demo.

## Database options

- **Local quick start:** SQLite database at `./bloodflow.db`; no separate DB
  setup is needed.
- **Docker Compose:** PostgreSQL 16 is provided. Set `POSTGRES_PASSWORD` and
  `JWT_SECRET` in `.env`, then run `docker compose up --build`.

The API currently creates tables from SQLAlchemy metadata at startup. Schema
versioning and production-grade PostgreSQL migrations are not yet implemented.

## Tests and checks

```powershell
python -m pytest backend\tests -q
Set-Location frontend
npm run lint
npm run typecheck
npm run build
```

## MVP workflows

1. Sign in with `manager@bloodflow.demo`.
2. Review the synthetic O+ red-cell shortage signal and facility map.
3. Generate a transfer recommendation from the assigned Nairobi facility to
   Kisumu. The recommendation preserves both projected seven-day demand and
   the source's configured safety stock.
4. Review the recommended quantity and explicitly click **Human approve**.
   The API reserves eligible units and records an audit event only after
   approval. Completion is a separate, human-recorded action in the Transfers
   API.

## Implemented and not yet implemented

Implemented: role-checked API access, signed bearer tokens, read-only public
registration and demo login, facilities, unit inventory, eligibility filtering,
a public homepage and authenticated operations dashboard, API-backed analytics,
forecast and inventory visualizations, date/product/facility filters, demand CSV
export, a 7–30 day moving-average baseline, shortage/near-expiry alerts,
source-demand/safety-stock-aware transfer recommendations, explicit manager/admin
approval, cold-chain breach quarantine, and audit records for
approval/completion/quarantine.

Not implemented: Alembic migrations, production account provisioning and
token revocation, CSV import, full inventory editing/history, cold-chain
incident clearance after qualified human review, OR-Tools optimization,
travel estimates, forecast ML training/comparison/validated uncertainty or
accuracy evaluation, 18–24 months of synthetic history, historical inventory
snapshots, wastage-event records, multi-worker concurrency stress testing, and
the settings UX. MAE, RMSE, WAPE, historical shortage frequency, wastage, and
transfer impact are explicitly unavailable where required source records do not
exist. The forecast and map/demo UI are clearly labelled as synthetic; do not
infer real-world model performance.

See [architecture](docs/architecture.md), [API](docs/api.md),
[database schema](docs/database-schema.md), [data dictionary](docs/data-dictionary.md),
[model card](docs/model-card.md), [safety limitations](docs/safety-limitations.md),
[deployment notes](docs/deployment.md), and the [demo walkthrough](docs/demo-walkthrough.md).
