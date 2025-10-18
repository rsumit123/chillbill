from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_current_user, get_db
from app.db.models.expense import Expense, ExpenseSplit
from app.db.models.group import GroupMember
from app.db.models.settlement import Settlement
from app.services.balances import compute_group_balances
from app.services.settlements import settlement_suggestions


class SettlementCreate(BaseModel):
    from_user_id: str
    to_user_id: str
    amount: float
    method: str = "manual"


router = APIRouter()


@router.get("/{group_id}/balances", response_model=dict)
async def get_balances(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    balances = await compute_group_balances(db, group_id)
    return {"group_id": group_id, "balances": balances}


@router.get("/{group_id}/settlements/suggestions", response_model=list[dict])
async def get_suggestions(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    balances = await compute_group_balances(db, group_id)
    suggestions = settlement_suggestions(balances)
    return suggestions


@router.post("/{group_id}/settlements", response_model=dict)
async def create_settlement(group_id: str, payload: SettlementCreate, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # basic: record a manual settlement
    st = Settlement(
        group_id=group_id,
        from_user_id=payload.from_user_id,
        to_user_id=payload.to_user_id,
        amount=payload.amount,
        currency="INR",
        method=payload.method,
        status="success",
    )
    db.add(st)
    await db.commit()
    await db.refresh(st)
    return {"id": st.id}
