from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from passlib.hash import argon2

from app.core.config import settings


def create_token(subject: str, expires_delta_minutes: int, token_type: str) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=expires_delta_minutes)
    to_encode: dict[str, Any] = {"sub": subject, "exp": expire, "type": token_type}
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algo)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return argon2.verify(plain_password, password_hash)


def hash_password(plain_password: str) -> str:
    return argon2.hash(plain_password)


def decode_token(token: str) -> Optional[dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algo])
        return payload
    except jwt.PyJWTError:
        return None
