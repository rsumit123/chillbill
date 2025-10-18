from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(title="ChillBill API", version="0.1.0", openapi_url="/openapi.json")

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


@app.get("/healthz", tags=["health"])  # simple healthcheck
async def healthcheck():
    return {"status": "ok"}
