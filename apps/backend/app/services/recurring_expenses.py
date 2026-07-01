"""Recurring expense rule materialization.

Contains:
- next_monthly_date: pure function advancing a date by one month, clamping day-of-month.
Additional helpers (create_rule_from_payload, materialize_due_rules) added in later tasks.
"""
from __future__ import annotations

import calendar
import logging
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.expense import Expense, ExpenseSplit
from app.db.models.group import GroupMember
from app.db.models.recurring_rule import RecurringRule


logger = logging.getLogger(__name__)


def next_monthly_date(prev: date, day_of_month: int) -> date:
    """Advance `prev` by one calendar month; clamp `day_of_month` to the new month's length.

    The stored `day_of_month` (1-31) is NOT mutated by clamping — this function only
    returns the correct next run date. So dom=31 in Feb yields Feb 28/29, but the rule
    still targets 31, restoring in March.
    """
    if prev.month < 12:
        y, m = prev.year, prev.month + 1
    else:
        y, m = prev.year + 1, 1
    last_day = calendar.monthrange(y, m)[1]
    return date(y, m, min(day_of_month, last_day))


async def create_expense_from_rule(
    db: AsyncSession, rule: RecurringRule, *, event_date: date
) -> Expense:
    """Materialize one rule instance as an Expense + ExpenseSplit rows.

    Uses the rule's splits_json snapshot verbatim. Sets recurring_rule_id so the
    UI can render the recurring badge.
    """
    e = Expense(
        group_id=rule.group_id,
        created_by=rule.created_by,
        paid_by_member_id=rule.paid_by_member_id,
        total_amount=rule.total_amount,
        currency=rule.currency,
        note=rule.note,
        date=datetime.combine(event_date, datetime.min.time()),
        recurring_rule_id=rule.id,
    )
    db.add(e)
    await db.flush()
    for s in rule.splits_json:
        db.add(ExpenseSplit(
            expense_id=e.id,
            member_id=s["member_id"],
            share_amount=Decimal(str(s["share_amount"])),
            share_percentage=s.get("share_percentage"),
        ))
    return e


async def _members_present(
    db: AsyncSession, group_id: str, member_ids: list[int]
) -> tuple[bool, int | None]:
    """Return (all_present, first_missing_id_or_None)."""
    if not member_ids:
        return (True, None)
    res = await db.execute(
        select(GroupMember.id).where(
            GroupMember.group_id == group_id,
            GroupMember.id.in_(member_ids),
        )
    )
    present = {row[0] for row in res.all()}
    for mid in member_ids:
        if mid not in present:
            return (False, mid)
    return (True, None)


async def materialize_due_rules(db: AsyncSession, today: date) -> int:
    """Materialize all active rules with next_run_at <= today.

    Rules whose splits reference removed members are auto-paused with a reason.
    Returns the count of expenses actually created.
    """
    res = await db.execute(
        select(RecurringRule).where(
            RecurringRule.is_active.is_(True),
            RecurringRule.next_run_at <= today,
        )
    )
    rules = list(res.scalars().all())
    created = 0
    for rule in rules:
        try:
            required_ids = [s["member_id"] for s in rule.splits_json] + [rule.paid_by_member_id]
            ok, missing = await _members_present(db, rule.group_id, required_ids)
            if not ok:
                rule.is_active = False
                rule.paused_reason = f"Member no longer in group (id={missing})"
                continue
            await create_expense_from_rule(db, rule, event_date=today)
            rule.next_run_at = next_monthly_date(rule.next_run_at, rule.day_of_month)
            created += 1
        except Exception as e:
            logger.exception("materialize failed for rule %s", rule.id)
            rule.is_active = False
            rule.paused_reason = f"Materialization error: {type(e).__name__}"
    await db.commit()
    return created
