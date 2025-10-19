from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os

from app.core.deps import get_current_user, get_db
from app.core.config import settings
from app.db.models.expense import Expense, ExpenseSplit
from app.db.models.group import GroupMember


class ExpenseSplitIn(BaseModel):
    member_id: int
    share_amount: float
    share_percentage: float | None = None


class ExpenseCreate(BaseModel):
    total_amount: float
    currency: str
    note: str | None = None
    date: datetime | None = None
    splits: list[ExpenseSplitIn]
    paid_by_member_id: int  # member_id of the payer


router = APIRouter()


@router.get("/{group_id}/expenses", response_model=list[dict])
async def list_expenses(group_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # simple list without pagination for MVP
    res = await db.execute(select(Expense).where(Expense.group_id == group_id, Expense.deleted_at.is_(None)).order_by(Expense.date.desc()))
    expenses = res.scalars().all()
    return [
        {
            "id": e.id,
            "total_amount": float(e.total_amount),
            "currency": e.currency,
            "note": e.note,
            "date": e.date.isoformat(),
            "created_by": e.created_by,
        }
        for e in expenses
    ]


@router.post("/{group_id}/expenses", response_model=dict)
async def create_expense(group_id: str, payload: ExpenseCreate, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # basic membership check
    member = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id)
    )
    if not member.scalars().first():
        raise HTTPException(status_code=403, detail="Not a group member")

    # basic validation
    if payload.total_amount is None or payload.total_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    # Verify the payer is a member of this group
    payer_member = await db.get(GroupMember, payload.paid_by_member_id)
    if not payer_member or payer_member.group_id != group_id:
        raise HTTPException(status_code=400, detail="Payer is not a member of this group")

    expense = Expense(
        group_id=group_id,
        created_by=payer_member.user_id,  # Will be None for ghost members
        paid_by_member_id=payload.paid_by_member_id,
        total_amount=payload.total_amount,
        currency=payload.currency,
        note=payload.note,
        date=payload.date or datetime.utcnow(),
    )
    db.add(expense)
    await db.flush()
    for s in payload.splits:
        db.add(
            ExpenseSplit(
                expense_id=expense.id,
                member_id=s.member_id,
                share_amount=s.share_amount,
                share_percentage=s.share_percentage,
            )
        )
    await db.commit()
    await db.refresh(expense)
    return {"id": expense.id}


@router.get("/expenses/{expense_id}", response_model=dict)
async def get_expense(expense_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    expense = await db.get(Expense, expense_id)
    if not expense or expense.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Expense not found")
    splits_res = await db.execute(select(ExpenseSplit).where(ExpenseSplit.expense_id == expense_id))
    splits = [
        {
            "member_id": s.member_id,
            "share_amount": float(s.share_amount),
            "share_percentage": float(s.share_percentage) if s.share_percentage is not None else None,
        }
        for s in splits_res.scalars().all()
    ]
    return {
        "id": expense.id,
        "group_id": expense.group_id,
        "created_by": expense.created_by,
        "total_amount": float(expense.total_amount),
        "currency": expense.currency,
        "note": expense.note,
        "date": expense.date.isoformat(),
        "splits": splits,
        "receipt_path": expense.receipt_path,
    }


@router.put("/expenses/{expense_id}", response_model=dict)
async def update_expense(expense_id: str, payload: ExpenseCreate, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    expense = await db.get(Expense, expense_id)
    if not expense or expense.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Expense not found")
    expense.total_amount = payload.total_amount
    expense.currency = payload.currency
    expense.note = payload.note
    expense.date = payload.date or expense.date
    
    # Verify the payer is a member of the same group
    payer_member = await db.get(GroupMember, payload.paid_by_member_id)
    if not payer_member or payer_member.group_id != expense.group_id:
        raise HTTPException(status_code=400, detail="Payer is not a member of this group")
    
    expense.paid_by_member_id = payload.paid_by_member_id
    expense.created_by = payer_member.user_id  # Will be None for ghost members
    
    # replace splits
    await db.execute(
        ExpenseSplit.__table__.delete().where(ExpenseSplit.expense_id == expense_id)
    )
    for s in payload.splits:
        db.add(ExpenseSplit(expense_id=expense_id, member_id=s.member_id, share_amount=s.share_amount, share_percentage=s.share_percentage))
    await db.commit()
    return {"id": expense.id}


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(expense_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    expense = await db.get(Expense, expense_id)
    if not expense or expense.deleted_at is not None:
        return None
    expense.deleted_at = datetime.utcnow()
    await db.commit()
    return None


@router.post("/receipt", response_model=dict)
async def upload_receipt(file: UploadFile = File(...)):
    os.makedirs(settings.uploads_dir, exist_ok=True)
    dest_path = os.path.join(settings.uploads_dir, file.filename)
    with open(dest_path, "wb") as f:
        f.write(await file.read())
    return {"receipt_path": dest_path}
