from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(title="Halvio API", version="0.1.0", openapi_url="/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers will be included here
from app.api.v1 import router as api_router  # noqa: E402

app.include_router(api_router, prefix="/api/v1")


from app.services.recurring_scheduler import start_scheduler, run_startup_catchup, shutdown_scheduler  # noqa: E402


@app.on_event("startup")
async def _recurring_startup():
    start_scheduler()
    await run_startup_catchup()


@app.on_event("shutdown")
async def _recurring_shutdown():
    shutdown_scheduler()


@app.get("/healthz", tags=["health"])  # simple healthcheck
async def healthcheck():
    return {"status": "ok"}
