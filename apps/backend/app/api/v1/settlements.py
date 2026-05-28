from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_current_user, get_db
from app.db.models.group import Group, GroupMember
from app.db.models.settlement import Settlement
from app.services.balances import compute_group_balances
from app.services.settlements import settlement_suggestions


class SettlementCreate(BaseModel):
    from_member_id: int
    to_member_id: int
    amount: float
    method: str = "manual"


router = APIRouter()


async def _require_membership(db: AsyncSession, group_id: str, user_id: str) -> Group:
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    res = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
    )
    if not res.scalars().first():
        raise HTTPException(status_code=403, detail="Not a group member")
    return group


@router.get("/{group_id}/balances", response_model=dict)
async def get_balances(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _require_membership(db, group_id, current_user.id)
    balances = await compute_group_balances(db, group_id)
    # JSON object keys must be strings.
    return {"group_id": group_id, "balances": {str(k): v for k, v in balances.items()}}


@router.get("/{group_id}/settlements/suggestions", response_model=list[dict])
async def get_suggestions(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _require_membership(db, group_id, current_user.id)
    balances = await compute_group_balances(db, group_id)
    return settlement_suggestions(balances)


@router.post("/{group_id}/settlements", response_model=dict)
async def create_settlement(
    group_id: str,
    payload: SettlementCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await _require_membership(db, group_id, current_user.id)

    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if payload.from_member_id == payload.to_member_id:
        raise HTTPException(status_code=400, detail="from and to must be different members")

    # Both members must belong to this group.
    for mid in (payload.from_member_id, payload.to_member_id):
        m = await db.get(GroupMember, mid)
        if not m or m.group_id != group_id:
            raise HTTPException(status_code=400, detail="Member is not in this group")

    st = Settlement(
        group_id=group_id,
        from_member_id=payload.from_member_id,
        to_member_id=payload.to_member_id,
        amount=payload.amount,
        currency=group.currency,
        method=payload.method,
        status="success",
    )
    db.add(st)
    await db.commit()
    await db.refresh(st)
    return {"id": st.id, "currency": st.currency}


@router.get("/{group_id}/settlements", response_model=list[dict])
async def list_settlements(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Recorded settlements in this group, newest first."""
    await _require_membership(db, group_id, current_user.id)
    res = await db.execute(
        select(Settlement)
        .where(Settlement.group_id == group_id)
        .order_by(Settlement.created_at.desc())
    )
    return [
        {
            "id": s.id,
            "from_member_id": s.from_member_id,
            "to_member_id": s.to_member_id,
            "amount": float(s.amount),
            "currency": s.currency,
            "method": s.method,
            "status": s.status,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in res.scalars().all()
    ]
