"""Recurring rules CRUD + pause/resume endpoints."""
from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1._helpers import require_membership
from app.core.deps import get_current_user, get_db
from app.db.models.group import GroupMember
from app.db.models.recurring_rule import RecurringRule
from app.db.models.user import User
from app.services.recurring_expenses import next_monthly_date


router = APIRouter(prefix="/groups", tags=["recurring-rules"])


class SplitIn(BaseModel):
    member_id: int
    share_amount: float
    share_percentage: float | None = None


class RecurringRuleCreate(BaseModel):
    paid_by_member_id: int
    total_amount: float = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    note: str | None = None
    splits: list[SplitIn]
    day_of_month: int = Field(ge=1, le=31)
    start_from_next_month: bool = True


def _serialize(rule: RecurringRule) -> dict:
    return {
        "id": rule.id,
        "group_id": rule.group_id,
        "paid_by_member_id": rule.paid_by_member_id,
        "total_amount": float(rule.total_amount),
        "currency": rule.currency,
        "note": rule.note,
        "splits": rule.splits_json,
        "day_of_month": rule.day_of_month,
        "next_run_at": rule.next_run_at.isoformat(),
        "is_active": rule.is_active,
        "paused_reason": rule.paused_reason,
    }


def _first_next_run(day_of_month: int, start_from_next_month: bool, today: date) -> date:
    """If starting next month, jump ahead; otherwise this month if dom hasn't passed, else next."""
    if start_from_next_month:
        return next_monthly_date(today, day_of_month)
    last = calendar.monthrange(today.year, today.month)[1]
    dom = min(day_of_month, last)
    candidate = date(today.year, today.month, dom)
    if candidate >= today:
        return candidate
    return next_monthly_date(today, day_of_month)


@router.post("/{group_id}/recurring-rules", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_recurring_rule(
    group_id: str,
    payload: RecurringRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_membership(db, group_id, current_user.id)

    required = {s.member_id for s in payload.splits} | {payload.paid_by_member_id}
    res = await db.execute(
        select(GroupMember.id).where(GroupMember.group_id == group_id, GroupMember.id.in_(required))
    )
    present = {row[0] for row in res.all()}
    missing = required - present
    if missing:
        raise HTTPException(status_code=400, detail=f"Members not in group: {sorted(missing)}")

    rule = RecurringRule(
        group_id=group_id,
        paid_by_member_id=payload.paid_by_member_id,
        total_amount=Decimal(str(payload.total_amount)),
        currency=payload.currency.upper(),
        note=payload.note,
        splits_json=[s.model_dump() for s in payload.splits],
        day_of_month=payload.day_of_month,
        next_run_at=_first_next_run(payload.day_of_month, payload.start_from_next_month, date.today()),
        is_active=True,
        created_by=current_user.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.get("/{group_id}/recurring-rules", response_model=dict)
async def list_recurring_rules(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_membership(db, group_id, current_user.id)
    res = await db.execute(
        select(RecurringRule).where(RecurringRule.group_id == group_id).order_by(RecurringRule.created_at.desc())
    )
    return {"rules": [_serialize(r) for r in res.scalars().all()]}


@router.put("/{group_id}/recurring-rules/{rule_id}", response_model=dict)
async def update_recurring_rule(
    group_id: str,
    rule_id: int,
    payload: RecurringRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_membership(db, group_id, current_user.id)
    rule = await db.get(RecurringRule, rule_id)
    if not rule or rule.group_id != group_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.paid_by_member_id = payload.paid_by_member_id
    rule.total_amount = Decimal(str(payload.total_amount))
    rule.currency = payload.currency.upper()
    rule.note = payload.note
    rule.splits_json = [s.model_dump() for s in payload.splits]
    rule.day_of_month = payload.day_of_month
    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.post("/{group_id}/recurring-rules/{rule_id}/pause", response_model=dict)
async def pause_rule(
    group_id: str,
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_membership(db, group_id, current_user.id)
    rule = await db.get(RecurringRule, rule_id)
    if not rule or rule.group_id != group_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.is_active = False
    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.post("/{group_id}/recurring-rules/{rule_id}/resume", response_model=dict)
async def resume_rule(
    group_id: str,
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_membership(db, group_id, current_user.id)
    rule = await db.get(RecurringRule, rule_id)
    if not rule or rule.group_id != group_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.is_active = True
    rule.paused_reason = None
    today = date.today()
    if rule.next_run_at < today:
        rule.next_run_at = _first_next_run(rule.day_of_month, True, today)
    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.delete("/{group_id}/recurring-rules/{rule_id}", status_code=204)
async def delete_recurring_rule(
    group_id: str,
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_membership(db, group_id, current_user.id)
    rule = await db.get(RecurringRule, rule_id)
    if not rule or rule.group_id != group_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
