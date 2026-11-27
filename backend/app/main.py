from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import alerts, analytics, auth, facilities, forecasts, inventory, temperature_events, transfers
from app.core.config import FRONTEND_ORIGINS
from app import database
from app.database import Base
from app.services.seed import seed_demo_data


def create_app(seed_demo_enabled: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        Base.metadata.create_all(bind=database.engine)
        if seed_demo_enabled:
            with database.SessionLocal() as db:
                seed_demo_data(db)
        yield

    application = FastAPI(
        title="BloodFlow AI API",
        description="Simulated blood inventory decision support. Human review is required for transfers.",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=FRONTEND_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type"],
    )
    for route in (
        auth.router,
        facilities.router,
        inventory.router,
        forecasts.router,
        alerts.router,
        transfers.router,
        analytics.router,
        temperature_events.router,
    ):
        application.include_router(route)

    @application.get("/health")
    def health():
        return {"status": "ok", "synthetic_data": True}

    return application


app = create_app()
