"""FastAPI application entrypoint.

Startup/shutdown via the lifespan context manager (the modern pattern). The
in-process scheduler is started here and torn down on shutdown.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import scheduler
from app.api.routes import router
from app.config import get_settings
from app.db.base import dispose_engine
from app.logging import configure_logging, get_logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    log = get_logger("startup")
    await scheduler.start()
    log.info("app_started")
    try:
        yield
    finally:
        await scheduler.shutdown()
        await dispose_engine()
        log.info("app_stopped")


app = FastAPI(title="gatherer — tech radar", version="0.1.0", lifespan=lifespan)

# Local dev: the Vite frontend talks to this API. Tighten origins in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
