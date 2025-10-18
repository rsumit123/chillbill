from functools import lru_cache
from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    db_url: str = os.getenv("DB_URL", "sqlite+aiosqlite:///./chillbill.db")
    jwt_secret: str = os.getenv("JWT_SECRET", "devsecret")
    jwt_algo: str = os.getenv("JWT_ALGO", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    refresh_token_expire_minutes: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_MINUTES", "43200"))
    backend_cors_origins: List[str] = (
        os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:5173").split(",")
    )
    uploads_dir: str = os.getenv("UPLOADS_DIR", "./uploads/receipts")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
