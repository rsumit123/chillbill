"""Integration tests for recurring rules — materialization + endpoints."""
from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.expense import Expense, ExpenseSplit
from app.db.models.group import Group, GroupMember
from app.db.models.recurring_rule import RecurringRule
from app.db.models.user import User
from app.services.recurring_expenses import materialize_due_rules


async def _add_user(db: AsyncSession, email: str, name: str) -> User:
    from app.db.crud.user import create_user
    return await create_user(db, email=email, name=name, password_hash=None, auth_provider="email")


async def _add_group(db: AsyncSession, owner: User, currency: str = "INR") -> Group:
    g = Group(name="Flatmates", currency=currency, created_by=owner.id)
    db.add(g)
    await db.flush()
    return g


async def _add_member(db: AsyncSession, group: Group, user: User | None, name: str | None = None, is_ghost: bool = False) -> GroupMember:
    m = GroupMember(group_id=group.id, user_id=(user.id if user else None), name=name, is_ghost=is_ghost)
    db.add(m)
    await db.flush()
    return m


async def _add_rule(
    db: AsyncSession,
    *,
    group: Group,
    payer: GroupMember,
    members: list[GroupMember],
    total: float,
    day_of_month: int,
    next_run_at: date,
    is_active: bool = True,
    created_by: User,
) -> RecurringRule:
    per_share = round(total / len(members), 2)
    splits = [{"member_id": m.id, "share_amount": per_share, "share_percentage": None} for m in members]
    r = RecurringRule(
        group_id=group.id,
        paid_by_member_id=payer.id,
        total_amount=Decimal(str(total)),
        currency=group.currency,
        note="Rent",
        splits_json=splits,
        day_of_month=day_of_month,
        next_run_at=next_run_at,
        is_active=is_active,
        created_by=created_by.id,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


class TestMaterializeDueRules:
    async def test_simple_due_rule_creates_expense_and_advances(
        self, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        me = await _add_member(db_session, g, test_user)
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        f = await _add_member(db_session, g, friend)
        rule = await _add_rule(
            db_session, group=g, payer=me, members=[me, f],
            total=1000.0, day_of_month=1,
            next_run_at=date(2026, 3, 1), created_by=test_user,
        )

        created = await materialize_due_rules(db_session, today=date(2026, 3, 1))
        assert created == 1

        exps = (await db_session.execute(
            select(Expense).where(Expense.group_id == g.id)
        )).scalars().all()
        assert len(exps) == 1
        assert exps[0].recurring_rule_id == rule.id
        assert exps[0].total_amount == Decimal("1000.00")

        splits = (await db_session.execute(
            select(ExpenseSplit).where(ExpenseSplit.expense_id == exps[0].id)
        )).scalars().all()
        assert len(splits) == 2
        assert {round(float(s.share_amount), 2) for s in splits} == {500.00}

        await db_session.refresh(rule)
        assert rule.next_run_at == date(2026, 4, 1)

    async def test_future_rule_is_skipped(
        self, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        me = await _add_member(db_session, g, test_user)
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        f = await _add_member(db_session, g, friend)
        await _add_rule(
            db_session, group=g, payer=me, members=[me, f],
            total=500.0, day_of_month=15,
            next_run_at=date(2026, 4, 15), created_by=test_user,
        )
        created = await materialize_due_rules(db_session, today=date(2026, 3, 20))
        assert created == 0

    async def test_paused_rule_is_skipped(
        self, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        me = await _add_member(db_session, g, test_user)
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        f = await _add_member(db_session, g, friend)
        await _add_rule(
            db_session, group=g, payer=me, members=[me, f],
            total=500.0, day_of_month=1,
            next_run_at=date(2026, 3, 1), is_active=False, created_by=test_user,
        )
        created = await materialize_due_rules(db_session, today=date(2026, 3, 1))
        assert created == 0

    async def test_idempotent_same_day(
        self, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        me = await _add_member(db_session, g, test_user)
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        f = await _add_member(db_session, g, friend)
        await _add_rule(
            db_session, group=g, payer=me, members=[me, f],
            total=500.0, day_of_month=1,
            next_run_at=date(2026, 3, 1), created_by=test_user,
        )
        c1 = await materialize_due_rules(db_session, today=date(2026, 3, 1))
        c2 = await materialize_due_rules(db_session, today=date(2026, 3, 1))
        assert c1 == 1
        assert c2 == 0

    async def test_removed_member_auto_pauses(
        self, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        me = await _add_member(db_session, g, test_user)
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        f = await _add_member(db_session, g, friend)
        rule = await _add_rule(
            db_session, group=g, payer=me, members=[me, f],
            total=500.0, day_of_month=1,
            next_run_at=date(2026, 3, 1), created_by=test_user,
        )
        # Remove the friend from the group.
        await db_session.delete(f)
        await db_session.commit()

        created = await materialize_due_rules(db_session, today=date(2026, 3, 1))
        assert created == 0

        await db_session.refresh(rule)
        assert rule.is_active is False
        assert rule.paused_reason is not None
        assert "Member" in rule.paused_reason

    async def test_dom_31_in_feb_uses_feb_28(
        self, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, test_user)
        me = await _add_member(db_session, g, test_user)
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        f = await _add_member(db_session, g, friend)
        rule = await _add_rule(
            db_session, group=g, payer=me, members=[me, f],
            total=500.0, day_of_month=31,
            next_run_at=date(2026, 2, 28), created_by=test_user,
        )
        created = await materialize_due_rules(db_session, today=date(2026, 2, 28))
        assert created == 1
        await db_session.refresh(rule)
        # Next run advances to March 31.
        assert rule.next_run_at == date(2026, 3, 31)
