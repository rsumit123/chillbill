import base64
import hashlib
import os
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
import httpx
import jwt as pyjwt

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

# In-memory PKCE store (single server)
_login_verifiers: dict[str, str] = {}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _user_dict(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "avatar_url": user.avatar_url}


def _token_pair(user_id: str) -> dict:
    access = create_token(user_id, settings.access_token_expire_minutes, token_type="access")
    refresh = create_token(user_id, settings.refresh_token_expire_minutes, token_type="refresh")
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}


# --- Google OAuth: server-side redirect flow (same as finance-agent) ---

@router.get("/google/login")
def google_login_redirect():
    """Return a Google OAuth URL. Frontend redirects user there."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google Sign-In is not configured")

    code_verifier = _b64url(os.urandom(32))
    code_challenge = _b64url(hashlib.sha256(code_verifier.encode("ascii")).digest())
    state = _b64url(os.urandom(16))
    _login_verifiers[state] = code_verifier

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return {"auth_url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)}


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(""),
    db: AsyncSession = Depends(get_db),
):
    """Google OAuth callback: exchange code, create/find user, redirect to frontend with tokens."""
    code_verifier = _login_verifiers.pop(state, None)
    if not code_verifier:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {resp.text}")

    token_data = resp.json()
    id_token = token_data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="No id_token in response")

    # Decode ID token (trusted since it came directly from Google's token endpoint over HTTPS)
    user_info = pyjwt.decode(id_token, options={"verify_signature": False})

    email = user_info.get("email", "")
    name = user_info.get("name", email.split("@")[0])
    picture = user_info.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="Could not get email from Google")

    # Find or create user
    user = await get_user_by_email(db, email)
    if not user:
        user = await create_user(
            db,
            email=email,
            name=name,
            password_hash=None,
            avatar_url=picture,
            auth_provider="google",
        )
    else:
        if picture and not user.avatar_url:
            user.avatar_url = picture
        if name and user.name != name:
            user.name = name
        await db.commit()
        await db.refresh(user)

    # Build tokens
    tokens = _token_pair(user.id)
    user_json = _user_dict(user)

    # Redirect to frontend with tokens in URL fragment (not query params for security)
    import json
    from urllib.parse import quote
    frontend_url = settings.frontend_url
    callback_params = urlencode({
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "user": json.dumps(user_json),
    })
    return RedirectResponse(url=f"{frontend_url}/auth/callback?{callback_params}")


# --- Email/password endpoints (kept for backwards compatibility) ---

@router.post("/signup", response_model=AuthResponse)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = await create_user(db, email=payload.email, name=payload.name, password_hash=hash_password(payload.password))
    return {"user": _user_dict(user), "tokens": _token_pair(user.id)}


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, payload.email)
    if user and user.password_hash is None:
        raise HTTPException(
            status_code=400,
            detail="This account uses Google Sign-In. Please sign in with Google.",
        )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return {"user": _user_dict(user), "tokens": _token_pair(user.id)}


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
