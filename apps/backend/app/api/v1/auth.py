from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr

from app.core.security import create_token, hash_password, verify_password
from app.core.config import settings
from app.core.deps import get_db
from app.db.models.user import User
from app.db.crud.user import get_user_by_email, create_user


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AuthResponse(BaseModel):
    user: dict
    tokens: TokenPair


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshResponse(BaseModel):
    access_token: str


router = APIRouter()


@router.post("/signup", response_model=AuthResponse)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = await create_user(db, email=payload.email, name=payload.name, password_hash=hash_password(payload.password))
    access = create_token(user.id, settings.access_token_expire_minutes, token_type="access")
    refresh = create_token(user.id, settings.refresh_token_expire_minutes, token_type="refresh")
    return {"user": {"id": user.id, "email": user.email, "name": user.name, "avatar_url": user.avatar_url}, "tokens": {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}}


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    access = create_token(user.id, settings.access_token_expire_minutes, token_type="access")
    refresh = create_token(user.id, settings.refresh_token_expire_minutes, token_type="refresh")
    return {"user": {"id": user.id, "email": user.email, "name": user.name, "avatar_url": user.avatar_url}, "tokens": {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}}


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(payload: RefreshRequest):
    from app.core.security import decode_token

    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    new_access = create_token(data["sub"], settings.access_token_expire_minutes, token_type="access")
    return {"access_token": new_access}


@router.post("/logout", status_code=204)
async def logout():
    return None
