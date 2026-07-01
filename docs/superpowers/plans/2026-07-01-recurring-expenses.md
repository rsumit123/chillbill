# Recurring Expenses — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-materialize monthly recurring expenses (rent, subscriptions) from a saved rule template via a daily in-process scheduler.

**Architecture:** New `recurring_rules` table stores the template. A daily APScheduler job in the FastAPI app calls `materialize_due_rules(today)` — creates normal `Expense` + `ExpenseSplit` rows for each rule where `next_run_at <= today`, then advances `next_run_at`. Materialized expenses look like normal expenses in the feed with a 🔁 badge (via new nullable FK `expenses.recurring_rule_id`).

**Tech Stack:** FastAPI + async SQLAlchemy + Alembic (backend), APScheduler (scheduler), React 18 + Vite + Vitest (frontend), pytest (backend tests).

**Spec:** `docs/superpowers/specs/2026-07-01-recurring-expenses-design.md`

---

## File Structure

### Backend (new)
- `apps/backend/alembic/versions/20260701_0001_recurring_rules.py` — schema migration
- `apps/backend/app/db/models/recurring_rule.py` — SQLAlchemy model
- `apps/backend/app/services/recurring_expenses.py` — `create_rule_from_payload`, `materialize_due_rules`, `next_monthly_date`, `create_expense_from_rule`
- `apps/backend/app/services/recurring_scheduler.py` — APScheduler wrapper + startup hook
- `apps/backend/app/api/v1/recurring_rules.py` — CRUD + pause/resume endpoints
- `apps/backend/tests/unit/test_next_monthly_date.py` — pure-function tests
- `apps/backend/tests/integration/test_recurring_rules.py` — endpoint + materialization tests

### Backend (modified)
- `apps/backend/app/db/models/expense.py` — add `recurring_rule_id` column + relationship
- `apps/backend/app/api/v1/__init__.py` — register `recurring_rules` router
- `apps/backend/app/main.py` — start scheduler in startup event
- `apps/backend/requirements.txt` — add `APScheduler>=3.10,<4.0`
- `apps/backend/app/api/v1/expenses.py` — expose `recurring_rule_id` in expense responses

### Frontend (new)
- `apps/web/src/components/RecurringSection.jsx` — list of rules with kebab menu
- `apps/web/src/tests/components/RecurringSection.test.jsx` — vitest

### Frontend (modified)
- `apps/web/src/components/AddExpenseModal.jsx` — add "Repeat monthly" checkbox + rule POST
- `apps/web/src/pages/GroupDetailPage.jsx` — render `RecurringSection`, wire refresh
- `apps/web/src/tests/components/AddExpenseModal.test.jsx` — extend with repeat-checkbox tests (or create if not existing)

### Build
- `apps/web/android/app/build.gradle` — bump `versionCode 12→13`, `versionName 1.0.11→1.0.12`

---

## Phase 1: Backend schema + model

### Task 1.1: Alembic migration + Expense model FK

**Files:**
- Create: `apps/backend/alembic/versions/20260701_0001_recurring_rules.py`
- Modify: `apps/backend/app/db/models/expense.py`

- [ ] **Step 1: Create migration**

Create `apps/backend/alembic/versions/20260701_0001_recurring_rules.py`:

```python
"""recurring_rules + expenses.recurring_rule_id

Revision ID: 20260701_0001
Revises: 20260628_0001
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260701_0001"
down_revision = "20260628_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recurring_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("paid_by_member_id", sa.Integer(), sa.ForeignKey("group_members.id"), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("splits_json", postgresql.JSONB(), nullable=False),
        sa.Column("day_of_month", sa.SmallInteger(), nullable=False),
        sa.Column("next_run_at", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("paused_reason", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "idx_recurring_rules_next_run_active",
        "recurring_rules",
        ["next_run_at"],
        postgresql_where=sa.text("is_active"),
    )
    op.add_column(
        "expenses",
        sa.Column("recurring_rule_id", sa.Integer(), sa.ForeignKey("recurring_rules.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("expenses", "recurring_rule_id")
    op.drop_index("idx_recurring_rules_next_run_active", table_name="recurring_rules")
    op.drop_table("recurring_rules")
```

- [ ] **Step 2: Add FK column to Expense model**

Edit `apps/backend/app/db/models/expense.py`. Locate the existing `Expense` class. Add this column right after the other mapped columns (before the relationship definitions):

```python
    recurring_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_rules.id", ondelete="SET NULL"), nullable=True
    )
```

- [ ] **Step 3: Apply migration locally**

Run: `cd apps/backend && alembic upgrade head`
Expected: `INFO [alembic.runtime.migration] Running upgrade 20260628_0001 -> 20260701_0001, recurring_rules + expenses.recurring_rule_id`.

- [ ] **Step 4: Run tests to confirm no regression**

Run: `cd apps/backend && python3 -m pytest -x -q`
Expected: all pass (same count as before the task).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/alembic/versions/20260701_0001_recurring_rules.py apps/backend/app/db/models/expense.py
git commit -m "feat(db): add recurring_rules table + expenses.recurring_rule_id FK"
```

---

### Task 1.2: RecurringRule SQLAlchemy model

**Files:**
- Create: `apps/backend/app/db/models/recurring_rule.py`

- [ ] **Step 1: Create the model**

Create `apps/backend/app/db/models/recurring_rule.py`:

```python
"""SQLAlchemy model for recurring expense rules."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    paid_by_member_id: Mapped[int] = mapped_column(ForeignKey("group_members.id"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    splits_json: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)
    day_of_month: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    next_run_at: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    paused_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

- [ ] **Step 2: Register the model**

Confirm imports auto-discover via the existing model registry. Read `apps/backend/app/db/models/__init__.py`. If there's an explicit list, add `from .recurring_rule import RecurringRule` to it. Otherwise, leave as-is.

- [ ] **Step 3: Syntax check**

Run: `cd apps/backend && python3 -c "from app.db.models.recurring_rule import RecurringRule; print(RecurringRule.__tablename__)"`
Expected: `recurring_rules`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/db/models/recurring_rule.py apps/backend/app/db/models/__init__.py
git commit -m "feat(db): RecurringRule SQLAlchemy model"
```

---

## Phase 2: Materialization service (TDD)

### Task 2.1: Failing tests for `next_monthly_date`

**Files:**
- Create: `apps/backend/tests/unit/test_next_monthly_date.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/tests/unit/test_next_monthly_date.py`:

```python
"""Unit tests for next_monthly_date — pure function, month clamping + rollover."""
from datetime import date

import pytest

from app.services.recurring_expenses import next_monthly_date


class TestNextMonthlyDate:
    def test_simple_next_month(self):
        assert next_monthly_date(date(2026, 1, 15), 15) == date(2026, 2, 15)

    def test_dec_to_jan_year_rollover(self):
        assert next_monthly_date(date(2026, 12, 1), 1) == date(2027, 1, 1)

    def test_dom_31_clamps_in_feb_non_leap(self):
        assert next_monthly_date(date(2026, 1, 31), 31) == date(2026, 2, 28)

    def test_dom_31_clamps_in_feb_leap(self):
        # 2028 is a leap year.
        assert next_monthly_date(date(2028, 1, 31), 31) == date(2028, 2, 29)

    def test_dom_restores_in_month_after_clamp(self):
        # After clamping to Feb 28 with dom=31, the March run should be 31.
        assert next_monthly_date(date(2026, 2, 28), 31) == date(2026, 3, 31)

    def test_dom_31_clamps_in_april(self):
        assert next_monthly_date(date(2026, 3, 31), 31) == date(2026, 4, 30)

    def test_dom_1_always_first(self):
        assert next_monthly_date(date(2026, 4, 30), 1) == date(2026, 5, 1)
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd apps/backend && python3 -m pytest tests/unit/test_next_monthly_date.py -x -v`
Expected: FAIL — `ImportError: cannot import name 'next_monthly_date'`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/tests/unit/test_next_monthly_date.py
git commit -m "test(recurring): failing tests for next_monthly_date"
```

---

### Task 2.2: Implement `next_monthly_date`

**Files:**
- Create: `apps/backend/app/services/recurring_expenses.py`

- [ ] **Step 1: Create the service module with the pure function**

Create `apps/backend/app/services/recurring_expenses.py`:

```python
"""Recurring expense rule materialization.

Contains:
- next_monthly_date: pure function advancing a date by one month, clamping day-of-month.
- create_rule_from_payload: validates and inserts a new rule.
- create_expense_from_rule: materializes a single rule as an Expense + splits.
- materialize_due_rules: batch materialization driver invoked by the daily scheduler.
"""
from __future__ import annotations

import calendar
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any

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
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/backend && python3 -m pytest tests/unit/test_next_monthly_date.py -x -v`
Expected: all 7 PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/services/recurring_expenses.py
git commit -m "feat(recurring): next_monthly_date pure function"
```

---

### Task 2.3: Failing tests for `materialize_due_rules`

**Files:**
- Create: `apps/backend/tests/integration/test_recurring_rules.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/tests/integration/test_recurring_rules.py`:

```python
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
        rule = await _add_rule(
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
        rule = await _add_rule(
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
        rule = await _add_rule(
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


class TestRecurringRulesEndpointsAuth:
    async def test_list_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/groups/somegroup/recurring-rules")
        assert resp.status_code in (401, 403)

    async def test_create_requires_auth(self, client: AsyncClient):
        resp = await client.post("/api/v1/groups/somegroup/recurring-rules", json={})
        assert resp.status_code in (401, 403)


class TestRecurringRulesEndpoints:
    async def test_create_lists_pause_resume_delete_roundtrip(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g = await _add_group(db_session, test_user)
        me = await _add_member(db_session, g, test_user)
        f = await _add_member(db_session, g, friend)

        # Create.
        payload = {
            "paid_by_member_id": me.id,
            "total_amount": 15000,
            "currency": "INR",
            "note": "Rent",
            "splits": [
                {"member_id": me.id, "share_amount": 7500, "share_percentage": None},
                {"member_id": f.id, "share_amount": 7500, "share_percentage": None},
            ],
            "day_of_month": 1,
            "start_from_next_month": True,
        }
        resp = await client.post(
            f"/api/v1/groups/{g.id}/recurring-rules",
            json=payload,
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 201, resp.text
        rid = resp.json()["id"]

        # List.
        resp = await client.get(
            f"/api/v1/groups/{g.id}/recurring-rules",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()["rules"]) == 1

        # Pause.
        resp = await client.post(
            f"/api/v1/groups/{g.id}/recurring-rules/{rid}/pause",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

        # Resume.
        resp = await client.post(
            f"/api/v1/groups/{g.id}/recurring-rules/{rid}/resume",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

        # Delete.
        resp = await client.delete(
            f"/api/v1/groups/{g.id}/recurring-rules/{rid}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 204
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd apps/backend && python3 -m pytest tests/integration/test_recurring_rules.py -x -v`
Expected: `TestMaterializeDueRules` FAIL with `ImportError: cannot import name 'materialize_due_rules'`, endpoint tests FAIL with 404.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/tests/integration/test_recurring_rules.py
git commit -m "test(recurring): failing tests for materialize + endpoints"
```

---

### Task 2.4: Implement `materialize_due_rules` + helpers

**Files:**
- Modify: `apps/backend/app/services/recurring_expenses.py`

- [ ] **Step 1: Extend the service module**

Append to `apps/backend/app/services/recurring_expenses.py` (after the existing `next_monthly_date`):

```python
async def create_expense_from_rule(
    db: AsyncSession, rule: RecurringRule, *, event_date: date
) -> Expense:
    """Materialize one rule instance as an Expense + ExpenseSplit rows.

    Uses the rule's splits_json snapshot verbatim. Sets recurring_rule_id so the
    UI can render the 🔁 badge.
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

    Rules whose splits reference removed members are auto-paused.
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
```

- [ ] **Step 2: Run the materialization tests**

Run: `cd apps/backend && python3 -m pytest tests/integration/test_recurring_rules.py::TestMaterializeDueRules -x -v`
Expected: all 6 PASS.

- [ ] **Step 3: Run full backend test suite (endpoints still 404)**

Run: `cd apps/backend && python3 -m pytest -x -q -k "not TestRecurringRulesEndpoints"`
Expected: all pass (including materialize tests). The 3 endpoint tests will still fail — expected, next task.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/services/recurring_expenses.py
git commit -m "feat(recurring): materialize_due_rules + create_expense_from_rule"
```

---

## Phase 3: Endpoints

### Task 3.1: Recurring rules API

**Files:**
- Create: `apps/backend/app/api/v1/recurring_rules.py`
- Modify: `apps/backend/app/api/v1/__init__.py`

- [ ] **Step 1: Create the router**

Create `apps/backend/app/api/v1/recurring_rules.py`:

```python
"""Recurring rules CRUD + pause/resume."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

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
    """If starting next month, jump ahead; otherwise, this month if dom hasn't passed."""
    if start_from_next_month:
        return next_monthly_date(today, day_of_month)
    # Same month if the dom hasn't passed yet, else next month.
    import calendar
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
    group = await require_membership(db, group_id, current_user.id)

    # Validate paid_by + split members belong to this group.
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
    # Fast-forward if next_run_at is in the past.
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
```

- [ ] **Step 2: Register the router**

Read `apps/backend/app/api/v1/__init__.py`. Find where other routers are `include_router`'d. Add:

```python
from app.api.v1 import recurring_rules
...
api_router.include_router(recurring_rules.router)
```

Do NOT prefix with `/recurring-rules` — the router already has `prefix="/groups"`.

- [ ] **Step 3: Run endpoint tests**

Run: `cd apps/backend && python3 -m pytest tests/integration/test_recurring_rules.py -x -v`
Expected: all tests PASS (including auth + roundtrip).

- [ ] **Step 4: Full backend suite**

Run: `cd apps/backend && python3 -m pytest -x -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/api/v1/recurring_rules.py apps/backend/app/api/v1/__init__.py
git commit -m "feat(api): recurring-rules CRUD + pause/resume endpoints"
```

---

## Phase 4: Scheduler + expense payload update

### Task 4.1: APScheduler wiring

**Files:**
- Create: `apps/backend/app/services/recurring_scheduler.py`
- Modify: `apps/backend/app/main.py`
- Modify: `apps/backend/requirements.txt`

- [ ] **Step 1: Add APScheduler to requirements**

Append to `apps/backend/requirements.txt`:

```
APScheduler>=3.10,<4.0
```

- [ ] **Step 2: Install locally**

Run: `cd apps/backend && pip install "APScheduler>=3.10,<4.0"`
Expected: successful install.

- [ ] **Step 3: Create scheduler module**

Create `apps/backend/app/services/recurring_scheduler.py`:

```python
"""In-process daily scheduler that materializes due recurring rules.

Uses APScheduler AsyncIOScheduler. Runs once at startup (catchup) and daily at
05:00 UTC (~10:30 IST). Idempotent — `materialize_due_rules` skips rules already
advanced past today.
"""
from __future__ import annotations

import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.db.session import SessionLocal
from app.services.recurring_expenses import materialize_due_rules


logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_once() -> None:
    async with SessionLocal() as db:
        try:
            n = await materialize_due_rules(db, today=date.today())
            logger.info("recurring: materialized %d expense(s)", n)
        except Exception:
            logger.exception("recurring: materialization failed")


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    sched = AsyncIOScheduler(timezone="UTC")
    sched.add_job(
        _run_once,
        CronTrigger(hour=5, minute=0),
        id="materialize_recurring",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.start()
    _scheduler = sched
    logger.info("recurring: scheduler started (daily @ 05:00 UTC)")


async def run_startup_catchup() -> None:
    """Awaited from FastAPI's startup event to cover any missed days."""
    await _run_once()


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
```

- [ ] **Step 4: Wire into main.py**

Read `apps/backend/app/main.py`. Find the existing FastAPI app definition and any existing `@app.on_event("startup")` or `lifespan` handler. Add:

```python
from app.services.recurring_scheduler import start_scheduler, run_startup_catchup, shutdown_scheduler


@app.on_event("startup")
async def _recurring_startup():
    start_scheduler()
    await run_startup_catchup()


@app.on_event("shutdown")
async def _recurring_shutdown():
    shutdown_scheduler()
```

If the app already uses a `lifespan` context manager instead of `on_event`, extend that context: call `start_scheduler()` and `await run_startup_catchup()` on entry, `shutdown_scheduler()` on exit.

- [ ] **Step 5: Local smoke test**

Run: `cd apps/backend && python3 -c "
import asyncio
from app.services.recurring_scheduler import start_scheduler
async def main():
    start_scheduler()
    print('OK')
asyncio.run(main())
"`
Expected: `OK` (and a log line about scheduler starting).

- [ ] **Step 6: Full backend suite**

Run: `cd apps/backend && python3 -m pytest -x -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/app/services/recurring_scheduler.py apps/backend/app/main.py apps/backend/requirements.txt
git commit -m "feat(recurring): APScheduler startup + daily job"
```

---

### Task 4.2: Expose `recurring_rule_id` in expense responses

**Files:**
- Modify: `apps/backend/app/api/v1/expenses.py`

- [ ] **Step 1: Add the field**

Read `apps/backend/app/api/v1/expenses.py`. Find where a single expense is serialized (typical function name: `_serialize_expense`, or inline in the GET route). Add `"recurring_rule_id": e.recurring_rule_id` to the returned dict everywhere an expense is emitted (list, get one, create, update).

- [ ] **Step 2: Add a test**

Append to `apps/backend/tests/integration/test_recurring_rules.py`:

```python
class TestExpenseExposesRecurringRuleId:
    async def test_materialized_expense_has_recurring_rule_id_in_response(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g = await _add_group(db_session, test_user)
        me = await _add_member(db_session, g, test_user)
        f = await _add_member(db_session, g, friend)
        rule = await _add_rule(
            db_session, group=g, payer=me, members=[me, f],
            total=500.0, day_of_month=1,
            next_run_at=date(2026, 3, 1), created_by=test_user,
        )
        await materialize_due_rules(db_session, today=date(2026, 3, 1))

        resp = await client.get(
            f"/api/v1/groups/{g.id}/expenses",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        expenses = resp.json().get("expenses") or resp.json()
        # Response shape may be list or wrapped — normalize.
        if isinstance(expenses, dict) and "expenses" in expenses:
            expenses = expenses["expenses"]
        assert len(expenses) >= 1
        assert expenses[0]["recurring_rule_id"] == rule.id
```

- [ ] **Step 3: Run the new test**

Run: `cd apps/backend && python3 -m pytest tests/integration/test_recurring_rules.py::TestExpenseExposesRecurringRuleId -x -v`
Expected: PASS.

- [ ] **Step 4: Full backend suite**

Run: `cd apps/backend && python3 -m pytest -x -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/api/v1/expenses.py apps/backend/tests/integration/test_recurring_rules.py
git commit -m "feat(api): expose recurring_rule_id in expense responses"
```

---

## Phase 5: Deploy backend

### Task 5.1: Push + VM deploy + verify

- [ ] **Step 1: Push**

```bash
cd /Users/rsumit123/work/chillbill
git push origin main
```

- [ ] **Step 2: Deploy on VM**

Run:
```bash
ssh ssh-social 'cd /home/rsumit123/chillbill && git pull --ff-only origin main && docker compose up -d --build --force-recreate backend 2>&1 | tail -3'
```

- [ ] **Step 3: Run migration on the deployed container**

Run:
```bash
ssh ssh-social 'docker exec chillbill-backend-1 alembic upgrade head 2>&1 | tail -5'
```
Expected: `INFO [alembic.runtime.migration] Running upgrade ... -> 20260701_0001, recurring_rules ...`.

- [ ] **Step 4: Confirm scheduler booted**

Run:
```bash
ssh ssh-social 'docker logs --tail 40 chillbill-backend-1 2>&1 | grep -i "recurring\|scheduler"'
```
Expected: `recurring: scheduler started (daily @ 05:00 UTC)` and `recurring: materialized 0 expense(s)` (or similar).

- [ ] **Step 5: Verify endpoint live**

Run:
```bash
curl -sS -m 10 -o /dev/null -w "GET /recurring-rules (no auth) -> HTTP %{http_code}\n" "https://chillbill-api.skdev.one/api/v1/groups/x/recurring-rules"
```
Expected: HTTP 401.

End of Phase 5.

---

## Phase 6: Frontend

### Task 6.1: "Repeat monthly" checkbox in AddExpenseModal

**Files:**
- Modify: `apps/web/src/components/AddExpenseModal.jsx`

- [ ] **Step 1: Read the current AddExpenseModal**

Open `apps/web/src/components/AddExpenseModal.jsx`. Note where `date` is state and where the save handler POSTs `/expenses`.

- [ ] **Step 2: Add the checkbox state**

Right after the other `useState` declarations, add:

```jsx
const [repeat, setRepeat] = useState(false)
```

- [ ] **Step 3: Add the checkbox row**

Find the block that renders the split UI. Just BELOW it (before the Cancel/Save buttons), add:

```jsx
<label className="flex items-start gap-2 cursor-pointer mt-4">
  <input
    type="checkbox"
    className="mt-1"
    checked={repeat}
    onChange={e => setRepeat(e.target.checked)}
  />
  <div>
    <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Repeat monthly</div>
    <div className="text-xs text-neutral-500 dark:text-neutral-400">
      Also add this on the {ordinal(new Date(date).getDate())} of every month automatically.
    </div>
  </div>
</label>
```

Add the helper (top of file, before the component):

```jsx
function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}
```

- [ ] **Step 4: Update the save handler**

Locate the existing `save()` (or equivalent) function. Find where it does `await api.post(\`/groups/${groupId}/expenses\`, expensePayload, ...)`. Replace that single call with:

```jsx
const dayOfMonth = new Date(date).getDate()
const primary = api.post(`/groups/${groupId}/expenses`, expensePayload, { token: accessToken })
const secondary = repeat
  ? api.post(`/groups/${groupId}/recurring-rules`, {
      paid_by_member_id: expensePayload.paid_by_member_id,
      total_amount: expensePayload.total_amount,
      currency: expensePayload.currency,
      note: expensePayload.note,
      splits: expensePayload.splits,
      day_of_month: dayOfMonth,
      start_from_next_month: true,
    }, { token: accessToken })
  : Promise.resolve(null)
await Promise.all([primary, secondary])
```

- [ ] **Step 5: Verify build**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/AddExpenseModal.jsx
git commit -m "feat(web): 'Repeat monthly' checkbox creates recurring rule alongside expense"
```

---

### Task 6.2: RecurringSection component

**Files:**
- Create: `apps/web/src/components/RecurringSection.jsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/RecurringSection.jsx`:

```jsx
import { useEffect, useState, useCallback } from 'react'
import { api } from '../services/api.js'
import { useToast } from './Toast.jsx'

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return Number(amount).toFixed(2)
  }
}

function ordinal(n) {
  const s = ['th','st','nd','rd']
  const v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

export default function RecurringSection({ groupId, currency, accessToken, onRefresh }) {
  const [rules, setRules] = useState([])
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(null)   // rule id being acted on
  const { push } = useToast()

  const load = useCallback(() => {
    api.get(`/groups/${groupId}/recurring-rules`, { token: accessToken })
      .then(r => setRules(r.rules || []))
      .catch(() => setRules([]))
  }, [groupId, accessToken])

  useEffect(() => { load() }, [load])

  async function pause(rule) {
    setBusy(rule.id)
    try {
      await api.post(`/groups/${groupId}/recurring-rules/${rule.id}/pause`, {}, { token: accessToken })
      load()
      push('Paused', 'success')
    } catch (e) {
      push(e.message || 'Failed to pause', 'error')
    } finally { setBusy(null) }
  }

  async function resume(rule) {
    setBusy(rule.id)
    try {
      await api.post(`/groups/${groupId}/recurring-rules/${rule.id}/resume`, {}, { token: accessToken })
      load()
      push('Resumed', 'success')
    } catch (e) {
      push(e.message || 'Failed to resume', 'error')
    } finally { setBusy(null) }
  }

  async function remove(rule) {
    if (!confirm('Delete this recurring rule? Past expenses are not affected.')) return
    setBusy(rule.id)
    try {
      await api.del(`/groups/${groupId}/recurring-rules/${rule.id}`, { token: accessToken })
      load()
      push('Deleted', 'success')
      onRefresh?.()
    } catch (e) {
      push(e.message || 'Failed to delete', 'error')
    } finally { setBusy(null) }
  }

  if (rules.length === 0) return null

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 p-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Recurring bills ({rules.length})
        </span>
        <svg className={`ml-auto w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          {rules.map(r => (
            <div key={r.id} className="p-4 flex items-start gap-3">
              <div className="text-2xl leading-none">{r.is_active ? '🔁' : '⏸'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <div className="font-medium truncate">{r.note || '(no note)'}</div>
                  <div className="text-sm text-neutral-500 dark:text-neutral-400 ml-auto">
                    {fmt(r.total_amount, r.currency || currency)}
                  </div>
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {ordinal(r.day_of_month)} of every month · {r.splits.length} way split
                </div>
                {!r.is_active && r.paused_reason && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Paused: {r.paused_reason}
                  </div>
                )}
                <div className="mt-2 flex gap-3 text-xs">
                  {r.is_active ? (
                    <button className="text-blue-600 hover:underline disabled:opacity-50" disabled={busy === r.id} onClick={() => pause(r)}>Pause</button>
                  ) : (
                    <button className="text-blue-600 hover:underline disabled:opacity-50" disabled={busy === r.id} onClick={() => resume(r)}>Resume</button>
                  )}
                  <button className="text-red-600 hover:underline disabled:opacity-50" disabled={busy === r.id} onClick={() => remove(r)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/RecurringSection.jsx
git commit -m "feat(web): RecurringSection with pause/resume/delete"
```

---

### Task 6.3: Wire RecurringSection into GroupDetailPage + expense 🔁 badge

**Files:**
- Modify: `apps/web/src/pages/GroupDetailPage.jsx`

- [ ] **Step 1: Import + mount**

At the top of `apps/web/src/pages/GroupDetailPage.jsx`, add:

```jsx
import RecurringSection from '../components/RecurringSection.jsx'
```

Locate the JSX return. Find where the "Expenses" section renders. Just BEFORE that "Expenses" section, insert:

```jsx
{group && (
  <RecurringSection
    groupId={groupId}
    currency={group.currency}
    accessToken={accessToken}
    onRefresh={refreshLists}
  />
)}
```

- [ ] **Step 2: Add 🔁 badge to expense rows**

Inside the expense list rendering (the block that renders `expense.note`), add a small badge next to the note:

```jsx
{exp.recurring_rule_id && <span className="text-xs">🔁</span>}
```

Position it inline before or after the note text — match the existing note styling.

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/GroupDetailPage.jsx
git commit -m "feat(web): mount RecurringSection + show 🔁 on recurring expenses"
```

---

## Phase 7: Frontend tests

### Task 7.1: RecurringSection vitest

**Files:**
- Create: `apps/web/src/tests/components/RecurringSection.test.jsx`

- [ ] **Step 1: Write the tests**

Create `apps/web/src/tests/components/RecurringSection.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import RecurringSection from '../../components/RecurringSection.jsx'

vi.mock('../../services/api.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), del: vi.fn() },
}))
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => ({ push: vi.fn() }) }))

import { api } from '../../services/api.js'

const RULES_ONE_ACTIVE = { rules: [
  { id: 1, note: 'Rent', total_amount: 15000, currency: 'INR', day_of_month: 1, splits: [{member_id:1},{member_id:2}], is_active: true, paused_reason: null },
]}
const RULES_ONE_PAUSED = { rules: [
  { id: 2, note: 'Netflix', total_amount: 200, currency: 'INR', day_of_month: 15, splits: [{member_id:1},{member_id:2}], is_active: false, paused_reason: 'Member no longer in group (id=7)' },
]}

describe('RecurringSection', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.del).mockReset()
  })

  it('renders nothing when there are no rules', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ rules: [] })
    const { container } = render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalled())
    expect(container.textContent).not.toContain('Recurring')
  })

  it('renders active rule with pause button', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(RULES_ONE_ACTIVE)
    render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(screen.getByText('Rent')).toBeInTheDocument())
    expect(screen.getByText(/Pause/)).toBeInTheDocument()
  })

  it('renders paused rule with reason + Resume button', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(RULES_ONE_PAUSED)
    render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(screen.getByText('Netflix')).toBeInTheDocument())
    expect(screen.getByText(/Member no longer in group/)).toBeInTheDocument()
    expect(screen.getByText(/Resume/)).toBeInTheDocument()
  })

  it('clicking Pause fires the pause endpoint and reloads', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(RULES_ONE_ACTIVE).mockResolvedValueOnce({ rules: [] })
    vi.mocked(api.post).mockResolvedValueOnce({})
    render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(screen.getByText('Rent')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Pause/))
    await waitFor(() =>
      expect(vi.mocked(api.post)).toHaveBeenCalledWith('/groups/g/recurring-rules/1/pause', {}, { token: 't' })
    )
  })

  it('clicking Delete confirms then fires DELETE', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(RULES_ONE_ACTIVE).mockResolvedValueOnce({ rules: [] })
    vi.mocked(api.del).mockResolvedValueOnce({})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(screen.getByText('Rent')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Delete/))
    await waitFor(() =>
      expect(vi.mocked(api.del)).toHaveBeenCalledWith('/groups/g/recurring-rules/1', { token: 't' })
    )
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/web && npx vitest run src/tests/components/RecurringSection.test.jsx`
Expected: all 5 PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/tests/components/RecurringSection.test.jsx
git commit -m "test(web): RecurringSection render + pause/resume/delete actions"
```

---

### Task 7.2: AddExpenseModal repeat-checkbox vitest

**Files:**
- Modify: `apps/web/src/tests/components/AddExpenseModal.test.jsx` (create if missing)

- [ ] **Step 1: Check existing test file**

If `apps/web/src/tests/components/AddExpenseModal.test.jsx` doesn't exist yet, create it with the boilerplate below. If it exists, extend it with the new `describe` block.

Full file (or new describe block):

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AddExpenseModal from '../../components/AddExpenseModal.jsx'

vi.mock('../../services/api.js', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('../../components/Modal.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}))
vi.mock('../../components/Spinner.jsx', () => ({
  ButtonSpinner: () => <span data-testid="spinner" />,
  Spinner: () => <span data-testid="spinner" />,
}))

import { api } from '../../services/api.js'

const GROUP = {
  id: 'g1',
  currency: 'INR',
  members: [
    { member_id: 1, name: 'Alice', is_ghost: false },
    { member_id: 2, name: 'Bob',   is_ghost: false },
  ],
}

function open() {
  return render(
    <AddExpenseModal
      open={true}
      onClose={() => {}}
      group={GROUP}
      accessToken="tok"
      onCreated={() => {}}
    />
  )
}

describe('AddExpenseModal — Repeat monthly', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset()
    vi.mocked(api.post).mockResolvedValue({})
  })

  it('renders the Repeat monthly checkbox', () => {
    open()
    expect(screen.getByLabelText(/repeat monthly/i)).toBeInTheDocument()
  })

  it('checkbox starts unchecked', () => {
    open()
    expect(screen.getByLabelText(/repeat monthly/i)).not.toBeChecked()
  })

  it('save without checkbox posts only /expenses', async () => {
    open()
    // Fill required fields — mirror the manual flow.
    fireEvent.change(screen.getByPlaceholderText(/what was this for/i), { target: { value: 'Groceries' } })
    fireEvent.change(screen.getByPlaceholderText(/0\.00/i), { target: { value: '100' } })
    fireEvent.click(screen.getByText(/Save/))
    await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalled())
    const urls = vi.mocked(api.post).mock.calls.map(c => c[0])
    expect(urls.some(u => u.endsWith('/expenses'))).toBe(true)
    expect(urls.some(u => u.includes('recurring-rules'))).toBe(false)
  })

  it('save with checkbox posts to /expenses AND /recurring-rules', async () => {
    open()
    fireEvent.change(screen.getByPlaceholderText(/what was this for/i), { target: { value: 'Rent' } })
    fireEvent.change(screen.getByPlaceholderText(/0\.00/i), { target: { value: '15000' } })
    fireEvent.click(screen.getByLabelText(/repeat monthly/i))
    fireEvent.click(screen.getByText(/Save/))
    await waitFor(() => expect(vi.mocked(api.post)).toHaveBeenCalledTimes(2))
    const urls = vi.mocked(api.post).mock.calls.map(c => c[0])
    expect(urls).toEqual(expect.arrayContaining([
      expect.stringContaining('/expenses'),
      expect.stringContaining('/recurring-rules'),
    ]))
    // The recurring-rules payload should include day_of_month + start_from_next_month=true.
    const rrCall = vi.mocked(api.post).mock.calls.find(c => c[0].includes('recurring-rules'))
    expect(rrCall[1].start_from_next_month).toBe(true)
    expect(typeof rrCall[1].day_of_month).toBe('number')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/web && npx vitest run src/tests/components/AddExpenseModal.test.jsx`
Expected: all 4 PASS.

If the tests fail because a required field selector doesn't match your actual DOM (e.g. the note field placeholder differs), adjust the selectors — don't change component behavior.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/tests/components/AddExpenseModal.test.jsx
git commit -m "test(web): repeat-monthly checkbox posts to both endpoints"
```

---

## Phase 8: Version bump + build + deploy

### Task 8.1: Bump version and build

**Files:**
- Modify: `apps/web/android/app/build.gradle`

- [ ] **Step 1: Bump versionCode + versionName**

In `apps/web/android/app/build.gradle`, change:

```groovy
        versionCode 12
        versionName "1.0.11"
```
to:
```groovy
        versionCode 13
        versionName "1.0.12"
```

- [ ] **Step 2: Build web + sync Capacitor + AAB + debug APK**

Run:
```bash
cd /Users/rsumit123/work/chillbill/apps/web
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
npm run build
npx cap sync android
cd android
./gradlew clean assembleDebug bundleRelease
cp app/build/outputs/apk/debug/app-debug.apk ~/Downloads/halvio-1.0.12-debug.apk
cp app/build/outputs/bundle/release/app-release.aab ~/Downloads/halvio-1.0.12.aab
ls -lh ~/Downloads/halvio-1.0.12*
```
Expected: both files created.

- [ ] **Step 3: Commit + push**

```bash
cd /Users/rsumit123/work/chillbill
git add apps/web/android/app/build.gradle
git commit -m "build(android): bump to versionCode 13 / 1.0.12 — recurring expenses"
git push origin main
```

End of plan.

---

## Done criteria

- ✅ Backend: all pytest tests pass (existing + 6 materialize + 5 endpoint + 7 date-arithmetic = 18+ new).
- ✅ Backend deploy: migration applied on VM, scheduler startup logs seen, `GET /recurring-rules` returns 401 without auth.
- ✅ Web: AddExpenseModal shows the "Repeat monthly" checkbox; ticking it POSTs to both endpoints; RecurringSection appears on GroupDetailPage when rules exist; 🔁 badge on materialized expenses.
- ✅ Vitest: 5 new tests pass, no new regressions.
- ✅ AAB v1.0.12 ready to promote.

---

## Out of scope (v2 candidates)

Per the spec §11:
- Weekly / biweekly / custom cadences
- Per-user / per-group timezone
- Push notifications on materialization
- Backfill catchup for multiple missed months
- Cross-group rules
- Rule history view
