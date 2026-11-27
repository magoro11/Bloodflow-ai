# Deployment

## Local Docker Compose

Copy `.env.example` to `.env`, replace `POSTGRES_PASSWORD` and `JWT_SECRET`
with local-only values, and run:

```powershell
docker compose up --build
```

The UI listens on port 3000 and the API on port 8000. Compose uses PostgreSQL;
the API initializes the SQLAlchemy schema and optionally seeds demo data.
Persistent database data is stored in the `postgres_data` named volume.

## Production readiness

The Docker setup is for demonstration, not production deployment. Before
public exposure: disable `SEED_DEMO_DATA`, replace all demo accounts, provision
accounts through a reviewed workflow, use a managed secret store, configure
TLS and restrictive CORS, add rate limiting and token revocation, enable
backups/monitoring, implement Alembic migrations, stress-test concurrent
transfer operations, and complete security/privacy and clinical operations reviews.

Vercel/Render deployment configuration and a Damu-KE integration are not
implemented.
