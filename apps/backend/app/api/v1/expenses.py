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
from app.services.expense_parser import parse_expense_text
from app.api.v1._helpers import require_membership
from app.services.receipt_parser import (
    parse_receipt,
    ReceiptParseError,
)


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
    
    result = []
    for e in expenses:
        # Get splits for this expense
        splits_res = await db.execute(select(ExpenseSplit).where(ExpenseSplit.expense_id == e.id))
        splits = splits_res.scalars().all()
        
        # Get member IDs involved in this expense
        participant_ids = [s.member_id for s in splits]
        
        result.append({
            "id": e.id,
            "total_amount": float(e.total_amount),
            "currency": e.currency,
            "note": e.note,
            "date": e.date.isoformat(),
            "created_by": e.created_by,
            "participant_member_ids": participant_ids,  # List of member_ids involved
            "recurring_rule_id": e.recurring_rule_id,
        })
    
    return result


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
        "recurring_rule_id": expense.recurring_rule_id,
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


class ParseExpenseRequest(BaseModel):
    text: str


@router.post("/{group_id}/expenses/parse", response_model=dict)
async def parse_expense(
    group_id: str,
    payload: ParseExpenseRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await require_membership(db, group_id, current_user.id)

    # Build the members context for the parser.
    res = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id)
    )
    raw_members = res.scalars().all()
    members = [
        {"id": m.id, "name": m.name or "", "is_ghost": m.is_ghost}
        for m in raw_members
    ]

    # Find the current user's member id within this group.
    current_member = next(
        (m for m in raw_members if m.user_id == current_user.id), None
    )
    if not current_member:
        raise HTTPException(status_code=403, detail="Not a group member")

    parsed = await parse_expense_text(
        text=payload.text,
        members=members,
        currency=group.currency,
        current_member_id=current_member.id,
    )
    return parsed


_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
_ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/{group_id}/expenses/scan-receipt", response_model=dict)
async def scan_receipt(
    group_id: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await require_membership(db, group_id, current_user.id)

    if file.content_type not in _ALLOWED_MIMES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, or WEBP images are accepted")

    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    try:
        return await parse_receipt(contents, group_currency=group.currency)
    except ReceiptParseError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
