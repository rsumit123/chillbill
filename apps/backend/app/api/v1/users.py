from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.db.models.user import User


class MeResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str | None


class UpdateMeRequest(BaseModel):
    name: str | None = None
    avatar_url: str | None = None


router = APIRouter()


@router.get("/me", response_model=MeResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "avatar_url": current_user.avatar_url,
    }


@router.put("/me", response_model=MeResponse)
async def update_me(
    payload: UpdateMeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.name is not None:
        current_user.name = payload.name
    if payload.avatar_url is not None:
        current_user.avatar_url = payload.avatar_url
    await db.commit()
    await db.refresh(current_user)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "avatar_url": current_user.avatar_url,
    }
