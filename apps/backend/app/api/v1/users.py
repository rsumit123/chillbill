import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.db.models.user import User
from app.services.people_balances import compute_people_balances

UPI_RE = re.compile(r"^[\w.\-+]+@[\w.\-]+$")


class PaymentMethod(BaseModel):
    type: Literal["upi", "paypal", "venmo", "cashapp", "iban", "other"]
    value: str

    @field_validator("value")
    @classmethod
    def value_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 200:
            raise ValueError("value must be 1-200 characters")
        return v


class MeResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str | None
    payment_methods: list[PaymentMethod] = []


class UpdateMeRequest(BaseModel):
    name: str | None = None
    avatar_url: str | None = None


class PaymentMethodsUpdate(BaseModel):
    payment_methods: list[PaymentMethod]


class PaymentMethodsResponse(BaseModel):
    payment_methods: list[PaymentMethod]


router = APIRouter()


@router.get("/me", response_model=MeResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "avatar_url": current_user.avatar_url,
        "payment_methods": current_user.payment_methods or [],
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
        "payment_methods": current_user.payment_methods or [],
    }


@router.put("/me/payment-methods", response_model=PaymentMethodsResponse)
async def update_payment_methods(
    payload: PaymentMethodsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Format-specific validation
    for m in payload.payment_methods:
        if m.type == "upi" and not UPI_RE.match(m.value):
            raise HTTPException(
                status_code=400,
                detail="upi value must look like 'user@bank' (e.g. 'aarav@okicici')",
            )
    current_user.payment_methods = [m.model_dump() for m in payload.payment_methods]
    await db.commit()
    await db.refresh(current_user)
    return {"payment_methods": current_user.payment_methods}


@router.get("/me/balances/people", response_model=dict)
async def my_people_balances(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated per-person balances across all the user's groups (read-only).

    Excludes ghost members (no cross-group identity) and the current user.
    See spec at docs/superpowers/specs/2026-06-29-cross-group-owe-map-design.md.
    """
    people = await compute_people_balances(db, current_user.id)
    return {"people": people}
