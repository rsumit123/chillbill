# Cross-Group Owe Map (People tab) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `People` tab that aggregates per-person balances across all the user's groups (registered users only), with per-group breakdown.

**Architecture:** Backend computes the aggregate at request time via `compute_people_balances` (single new endpoint, no schema changes). Frontend renders an expandable list with per-currency totals and per-group jump links. Read-only — cross-group "Settle all" is deferred.

**Tech Stack:** FastAPI + async SQLAlchemy (backend), React 18 + Vite (frontend), pytest + Vitest (tests). Reuses existing `compute_group_balances`, existing `<Avatar />` component, existing currency formatting helper.

**Spec:** `docs/superpowers/specs/2026-06-29-cross-group-owe-map-design.md`

---

## File Structure

### Backend (new)
- `apps/backend/app/services/people_balances.py` — `compute_people_balances(db, current_user_id) -> list[dict]`
- `apps/backend/tests/integration/test_people_balances.py` — endpoint + service tests

### Backend (modified)
- `apps/backend/app/api/v1/users.py` — add `GET /me/balances/people` endpoint

### Frontend (new)
- `apps/web/src/pages/PeoplePage.jsx` — page component (data loading, error/empty/loading states)
- `apps/web/src/components/PersonRow.jsx` — expandable row component
- `apps/web/src/tests/pages/PeoplePage.test.jsx` — vitest

### Frontend (modified)
- `apps/web/src/App.jsx` — add `/dashboard/people` route
- `apps/web/src/components/Layout.jsx` — desktop nav + mobile dropdown entry

### Build
- `apps/web/android/app/build.gradle` — bump `versionCode 9 → 10`, `versionName 1.0.8 → 1.0.9`

---

## Phase 1: Backend

### Task 1.1: Failing tests for compute_people_balances service

**Files:**
- Create: `apps/backend/tests/integration/test_people_balances.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/tests/integration/test_people_balances.py`:

```python
"""Tests for cross-group People view aggregation."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember
from app.db.models.user import User
from app.db.models.expense import Expense, ExpenseSplit


async def _add_user(db: AsyncSession, email: str, name: str) -> User:
    from app.db.crud.user import create_user
    return await create_user(db, email=email, name=name, password_hash=None, auth_provider="email")


async def _add_group(db: AsyncSession, name: str, owner: User, currency: str = "INR") -> Group:
    g = Group(name=name, currency=currency, created_by=owner.id)
    db.add(g)
    await db.flush()
    return g


async def _add_member(db: AsyncSession, group: Group, user: User | None, name: str | None = None, is_ghost: bool = False) -> GroupMember:
    m = GroupMember(group_id=group.id, user_id=(user.id if user else None), name=name, is_ghost=is_ghost)
    db.add(m)
    await db.flush()
    return m


async def _add_expense(db: AsyncSession, group: Group, payer: GroupMember, total: float, splits: list[tuple[GroupMember, float]]) -> Expense:
    e = Expense(
        group_id=group.id,
        created_by=payer.user_id,
        paid_by_member_id=payer.id,
        total_amount=total,
        currency=group.currency,
        note="Test",
    )
    db.add(e)
    await db.flush()
    for m, share in splits:
        db.add(ExpenseSplit(expense_id=e.id, member_id=m.id, share_amount=share))
    await db.commit()
    return e


class TestPeopleBalancesEmpty:
    async def test_empty_when_user_has_no_groups(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"people": []}


class TestPeopleBalancesSimple:
    async def test_owed_by_one_registered_user(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        # current user (test_user) paid 100, split equally with one registered friend.
        # Friend owes test_user 50.
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g = await _add_group(db_session, "Trip", test_user)
        me = await _add_member(db_session, g, test_user)
        them = await _add_member(db_session, g, friend)
        await _add_expense(db_session, g, payer=me, total=100.0, splits=[(me, 50.0), (them, 50.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["people"]) == 1
        p = data["people"][0]
        assert p["user_id"] == friend.id
        assert p["name"] == "Friend"
        assert p["balances"] == {"INR": 50.0}
        assert len(p["groups"]) == 1
        assert p["groups"][0]["group_id"] == g.id
        assert p["groups"][0]["balance"] == 50.0

    async def test_owing_one_registered_user(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        # Friend paid 100, split equally. Test_user owes friend 50.
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g = await _add_group(db_session, "Trip", test_user)
        me = await _add_member(db_session, g, test_user)
        them = await _add_member(db_session, g, friend)
        await _add_expense(db_session, g, payer=them, total=100.0, splits=[(me, 50.0), (them, 50.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        data = resp.json()
        assert len(data["people"]) == 1
        assert data["people"][0]["balances"] == {"INR": -50.0}
        assert data["people"][0]["groups"][0]["balance"] == -50.0


class TestPeopleBalancesExclusion:
    async def test_solo_group_no_people(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, "Solo", test_user)
        await _add_member(db_session, g, test_user)
        # No expenses; no other members.
        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.json() == {"people": []}

    async def test_ghost_only_group_no_people(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        g = await _add_group(db_session, "GhostTrip", test_user)
        me = await _add_member(db_session, g, test_user)
        ghost = await _add_member(db_session, g, None, name="Aarav", is_ghost=True)
        await _add_expense(db_session, g, payer=me, total=100.0, splits=[(me, 50.0), (ghost, 50.0)])
        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        # Ghost should be excluded; resulting list empty.
        assert resp.json() == {"people": []}

    async def test_zero_balance_excluded(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        g = await _add_group(db_session, "Trip", test_user)
        me = await _add_member(db_session, g, test_user)
        them = await _add_member(db_session, g, friend)
        # Two expenses that cancel each other: me pays 100 (50/50), they pay 100 (50/50). Net zero.
        await _add_expense(db_session, g, payer=me, total=100.0, splits=[(me, 50.0), (them, 50.0)])
        await _add_expense(db_session, g, payer=them, total=100.0, splits=[(me, 50.0), (them, 50.0)])
        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.json() == {"people": []}


class TestPeopleBalancesMultiGroup:
    async def test_same_user_same_currency_two_groups(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        # Group 1: I paid 100, friend owes me 50.
        g1 = await _add_group(db_session, "Trip A", test_user)
        me1 = await _add_member(db_session, g1, test_user)
        them1 = await _add_member(db_session, g1, friend)
        await _add_expense(db_session, g1, payer=me1, total=100.0, splits=[(me1, 50.0), (them1, 50.0)])
        # Group 2: I paid 60, friend owes me 30.
        g2 = await _add_group(db_session, "Trip B", test_user)
        me2 = await _add_member(db_session, g2, test_user)
        them2 = await _add_member(db_session, g2, friend)
        await _add_expense(db_session, g2, payer=me2, total=60.0, splits=[(me2, 30.0), (them2, 30.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        data = resp.json()
        assert len(data["people"]) == 1
        p = data["people"][0]
        assert p["balances"] == {"INR": 80.0}
        groups = sorted(p["groups"], key=lambda x: x["balance"], reverse=True)
        assert groups[0]["balance"] == 50.0
        assert groups[1]["balance"] == 30.0

    async def test_same_user_multi_currency(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        # INR group: friend owes 50
        g1 = await _add_group(db_session, "Trip A", test_user, currency="INR")
        me1 = await _add_member(db_session, g1, test_user)
        them1 = await _add_member(db_session, g1, friend)
        await _add_expense(db_session, g1, payer=me1, total=100.0, splits=[(me1, 50.0), (them1, 50.0)])
        # USD group: I owe friend 20
        g2 = await _add_group(db_session, "Trip B", test_user, currency="USD")
        me2 = await _add_member(db_session, g2, test_user)
        them2 = await _add_member(db_session, g2, friend)
        await _add_expense(db_session, g2, payer=them2, total=40.0, splits=[(me2, 20.0), (them2, 20.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        p = resp.json()["people"][0]
        assert p["balances"] == {"INR": 50.0, "USD": -20.0}
        assert len(p["groups"]) == 2

    async def test_balance_cancels_across_groups_excludes_person(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        friend = await _add_user(db_session, "friend@example.com", "Friend")
        # Group 1: friend owes me 50
        g1 = await _add_group(db_session, "A", test_user)
        me1 = await _add_member(db_session, g1, test_user)
        them1 = await _add_member(db_session, g1, friend)
        await _add_expense(db_session, g1, payer=me1, total=100.0, splits=[(me1, 50.0), (them1, 50.0)])
        # Group 2: I owe friend 50
        g2 = await _add_group(db_session, "B", test_user)
        me2 = await _add_member(db_session, g2, test_user)
        them2 = await _add_member(db_session, g2, friend)
        await _add_expense(db_session, g2, payer=them2, total=100.0, splits=[(me2, 50.0), (them2, 50.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        # INR net 0 → person excluded.
        assert resp.json() == {"people": []}


class TestPeopleBalancesSorting:
    async def test_sorted_by_absolute_total_descending(
        self, client: AsyncClient, auth_token: str, db_session: AsyncSession, test_user: User
    ):
        small = await _add_user(db_session, "small@example.com", "SmallDebt")
        big = await _add_user(db_session, "big@example.com", "BigDebt")
        g = await _add_group(db_session, "Trip", test_user)
        me = await _add_member(db_session, g, test_user)
        s_mem = await _add_member(db_session, g, small)
        b_mem = await _add_member(db_session, g, big)
        # I pay 300 split as 50/100/150 → small owes 100, big owes 150
        await _add_expense(db_session, g, payer=me, total=300.0,
                            splits=[(me, 50.0), (s_mem, 100.0), (b_mem, 150.0)])

        resp = await client.get(
            "/api/v1/me/balances/people",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        names = [p["name"] for p in resp.json()["people"]]
        assert names == ["BigDebt", "SmallDebt"]


class TestPeopleBalancesAuth:
    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get("/api/v1/me/balances/people")
        assert resp.status_code in (401, 403)
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd apps/backend && python3 -m pytest tests/integration/test_people_balances.py -x -v`
Expected: tests FAIL with 404 (endpoint doesn't exist yet).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/tests/integration/test_people_balances.py
git commit -m "test(people-balances): failing tests for /me/balances/people"
```

---

### Task 1.2: Implement compute_people_balances service

**Files:**
- Create: `apps/backend/app/services/people_balances.py`

- [ ] **Step 1: Implement the service**

Create `apps/backend/app/services/people_balances.py`:

```python
"""Aggregate per-person balances across all groups the current user is in.

Returns a list of registered users (excluding ghosts and the current user)
who have a non-zero balance with the current user in at least one group/currency.
"""
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember
from app.db.models.user import User
from app.services.balances import compute_group_balances


_TOLERANCE = 0.01


async def compute_people_balances(db: AsyncSession, current_user_id: str) -> list[dict]:
    """Return people aggregated across the current user's groups.

    See spec §4.1 for the response shape. Sign convention: `+` means the
    other person owes the current user; `-` means the current user owes them.
    """
    # 1. Find all groups the current user is in (only those where the user is a registered member).
    res = await db.execute(
        select(GroupMember.group_id).where(GroupMember.user_id == current_user_id)
    )
    group_ids = [row[0] for row in res.all()]
    if not group_ids:
        return []

    # 2. Pre-fetch all groups (for name + currency).
    res = await db.execute(select(Group).where(Group.id.in_(group_ids)))
    groups_by_id = {g.id: g for g in res.scalars().all()}

    # 3. Pre-fetch all members across these groups (to map member_id -> user_id, name, is_ghost).
    res = await db.execute(
        select(GroupMember).where(GroupMember.group_id.in_(group_ids))
    )
    members_by_group: dict[str, list[GroupMember]] = defaultdict(list)
    for m in res.scalars().all():
        members_by_group[m.group_id].append(m)

    # 4. For each group, compute balances and collect contributions per other registered user.
    # Structure: contributions[user_id] = list of (group_id, currency, signed_balance_from_my_pov)
    contributions: dict[str, list[tuple]] = defaultdict(list)
    for gid in group_ids:
        group = groups_by_id.get(gid)
        if group is None:
            continue
        balances = await compute_group_balances(db, gid)  # {member_id: float, sign = positive means owed}
        for member in members_by_group.get(gid, []):
            if member.user_id is None:                  # ghost
                continue
            if member.user_id == current_user_id:       # yourself
                continue
            other_balance = float(balances.get(member.id, 0.0))
            # Other member's balance is `other_balance` (positive = they are owed by the group).
            # In OUR view, if they are owed, we owe them — so flip the sign.
            from_my_pov = -other_balance
            if abs(from_my_pov) < _TOLERANCE:
                continue
            contributions[member.user_id].append(
                (gid, group.name, group.currency, from_my_pov)
            )

    if not contributions:
        return []

    # 5. Load User rows for display info.
    res = await db.execute(select(User).where(User.id.in_(contributions.keys())))
    users_by_id = {u.id: u for u in res.scalars().all()}

    # 6. Build people output, then filter out anyone whose currencies all net to 0.
    people: list[dict] = []
    for uid, contribs in contributions.items():
        user = users_by_id.get(uid)
        if user is None:
            continue  # defensive: should never happen given FK integrity
        per_currency: dict[str, float] = defaultdict(float)
        for _gid, _gname, currency, amount in contribs:
            per_currency[currency] += amount
        # Drop currencies that cancel within tolerance.
        balances_out = {c: round(amt, 2) for c, amt in per_currency.items() if abs(amt) >= _TOLERANCE}
        if not balances_out:
            continue
        people.append({
            "user_id": user.id,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "balances": balances_out,
            "groups": [
                {
                    "group_id": gid,
                    "group_name": gname,
                    "currency": currency,
                    "balance": round(amount, 2),
                }
                for (gid, gname, currency, amount) in contribs
            ],
        })

    # 7. Sort by sum of absolute totals descending.
    people.sort(key=lambda p: sum(abs(v) for v in p["balances"].values()), reverse=True)
    return people
```

- [ ] **Step 2: Syntax check**

Run: `cd apps/backend && python3 -c "import ast; ast.parse(open('app/services/people_balances.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 3: Commit (no endpoint yet, tests still fail)**

```bash
git add apps/backend/app/services/people_balances.py
git commit -m "feat(services): compute_people_balances for cross-group aggregation"
```

---

### Task 1.3: Add GET /me/balances/people endpoint

**Files:**
- Modify: `apps/backend/app/api/v1/users.py`

- [ ] **Step 1: Add the endpoint**

Read `apps/backend/app/api/v1/users.py`. At the top, add the import:

```python
from app.services.people_balances import compute_people_balances
```

At the end of the file, add:

```python
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
```

(Note: `User`, `Depends`, `get_current_user`, `get_db`, `AsyncSession` are already imported in this file. Don't duplicate.)

- [ ] **Step 2: Run the failing tests — verify they pass**

Run: `cd apps/backend && python3 -m pytest tests/integration/test_people_balances.py -x -v`
Expected: all PASS.

- [ ] **Step 3: Run full backend suite — verify no regressions**

Run: `cd apps/backend && python3 -m pytest -x -q`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/api/v1/users.py
git commit -m "feat(api): GET /me/balances/people"
```

---

### Task 1.4: Deploy backend to VM

- [ ] **Step 1: Push**

```bash
cd /Users/rsumit123/work/chillbill
git push origin main
```

- [ ] **Step 2: Pull + rebuild on VM**

Run:
```bash
ssh ssh-social 'cd /home/rsumit123/chillbill && git pull --ff-only origin main && docker compose up -d --build --force-recreate backend 2>&1 | tail -3'
```

- [ ] **Step 3: Verify endpoint live**

Run:
```bash
curl -sS -m 10 -o /dev/null -w "GET /me/balances/people (no auth) -> HTTP %{http_code}\n" "https://chillbill-api.skdev.one/api/v1/me/balances/people"
```
Expected: HTTP 401 (auth required — proves route exists).

End of Phase 1.

---

## Phase 2: Frontend

### Task 2.1: PersonRow component

**Files:**
- Create: `apps/web/src/components/PersonRow.jsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/PersonRow.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from './Avatar.jsx'

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return Number(amount).toFixed(2)
  }
}

function BalanceLine({ amount, currency }) {
  const positive = amount > 0
  const negative = amount < 0
  if (!positive && !negative) return null
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className={positive ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
        {positive ? 'owes you' : 'you owe'}
      </span>
      <span className={`font-semibold ${positive ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
        {fmt(Math.abs(amount), currency)}
      </span>
    </div>
  )
}

export default function PersonRow({ person }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
        aria-expanded={open}
      >
        <Avatar name={person.name} url={person.avatar_url} size={40} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{person.name}</div>
          <div className="mt-1 space-y-0.5">
            {Object.entries(person.balances).map(([currency, amount]) => (
              <BalanceLine key={currency} amount={amount} currency={currency} />
            ))}
          </div>
        </div>
        <svg className={`w-5 h-5 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          {person.groups.map(g => {
            const positive = g.balance > 0
            const negative = g.balance < 0
            return (
              <button
                key={g.group_id + g.currency}
                type="button"
                onClick={() => navigate(`/dashboard/groups/${g.group_id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{g.group_name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{g.currency}</div>
                </div>
                <div className={`text-sm font-medium ${positive ? 'text-green-700 dark:text-green-400' : negative ? 'text-red-700 dark:text-red-400' : ''}`}>
                  {positive ? 'owes you ' : negative ? 'you owe ' : ''}
                  {fmt(Math.abs(g.balance), g.currency)}
                </div>
                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )
          })}
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
git add apps/web/src/components/PersonRow.jsx
git commit -m "feat(web): PersonRow component for cross-group People view"
```

---

### Task 2.2: PeoplePage

**Files:**
- Create: `apps/web/src/pages/PeoplePage.jsx`

- [ ] **Step 1: Create the page**

Create `apps/web/src/pages/PeoplePage.jsx`:

```jsx
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { api } from '../services/api.js'
import { Spinner } from '../components/Spinner.jsx'
import PersonRow from '../components/PersonRow.jsx'

export default function PeoplePage() {
  const { accessToken } = useAuth()
  const [people, setPeople] = useState(null)   // null = loading, array = loaded
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    setPeople(null)
    api.get('/me/balances/people', { token: accessToken })
      .then(r => setPeople(r.people || []))
      .catch(e => setError(e?.message || 'Failed to load balances'))
  }, [accessToken])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">People</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Who owes you and who you owe, across all your groups. Tap a person to see the per-group breakdown.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          <button onClick={load} className="text-sm font-medium text-red-700 dark:text-red-300 underline">Retry</button>
        </div>
      )}

      {!error && people === null && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" className="text-blue-600" />
        </div>
      )}

      {!error && people !== null && people.length === 0 && (
        <div className="text-center py-12 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
          <div className="text-4xl mb-3">🎉</div>
          <div className="text-neutral-700 dark:text-neutral-200 font-medium">All settled up.</div>
          <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            When friends owe you or vice versa, they'll show up here.
          </div>
        </div>
      )}

      {!error && people !== null && people.length > 0 && (
        <div className="space-y-3">
          {people.map(p => <PersonRow key={p.user_id} person={p} />)}
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
git add apps/web/src/pages/PeoplePage.jsx
git commit -m "feat(web): PeoplePage with load/empty/error/list states"
```

---

### Task 2.3: Add /dashboard/people route + nav links

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/components/Layout.jsx`

- [ ] **Step 1: Add the route**

In `apps/web/src/App.jsx`, add the import (next to the other page imports):

```jsx
import PeoplePage from './pages/PeoplePage.jsx'
```

Inside the `/dashboard` route children, add (next to `settings`):

```jsx
<Route path="people" element={<PeoplePage />} />
```

- [ ] **Step 2: Add desktop nav link**

In `apps/web/src/components/Layout.jsx`, find the desktop nav block that contains the existing `NavLink to="/dashboard"` for Groups. Right after that NavLink (before the theme toggle button), add:

```jsx
<NavLink
  to="/dashboard/people"
  className={({isActive}) => `
    flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
    ${isActive
      ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
    }
  `}
>
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
  People
</NavLink>
```

- [ ] **Step 3: Add mobile dropdown link**

In the same file, find the mobile dropdown menu (the section with `NavLink to="/dashboard"` "Your Groups" inside the dropdown). Add another NavLink just above the Settings link:

```jsx
<NavLink
  to="/dashboard/people"
  className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
  onClick={() => setMenuOpen(false)}
>
  <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
  <span>People</span>
</NavLink>
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.jsx apps/web/src/components/Layout.jsx
git commit -m "feat(web): /dashboard/people route + desktop + mobile nav entries"
```

---

### Task 2.4: PeoplePage vitest

**Files:**
- Create: `apps/web/src/tests/pages/PeoplePage.test.jsx`

- [ ] **Step 1: Write the tests**

Create `apps/web/src/tests/pages/PeoplePage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PeoplePage from '../../pages/PeoplePage.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ accessToken: 'TEST_TOKEN' }),
}))

const apiGet = vi.fn()
vi.mock('../../services/api.js', () => ({
  api: { get: (...args) => apiGet(...args) },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <PeoplePage />
    </MemoryRouter>
  )
}

describe('PeoplePage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    mockNavigate.mockReset()
  })

  it('shows loading initially then empty state when API returns no people', async () => {
    apiGet.mockResolvedValueOnce({ people: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText(/all settled up/i)).toBeInTheDocument())
  })

  it('renders one row per person', async () => {
    apiGet.mockResolvedValueOnce({
      people: [
        {
          user_id: 'u1', name: 'Aarav', avatar_url: null,
          balances: { INR: 800 },
          groups: [
            { group_id: 'g1', group_name: 'Goa Trip', currency: 'INR', balance: 600 },
            { group_id: 'g2', group_name: 'Flatmate', currency: 'INR', balance: 200 },
          ],
        },
        {
          user_id: 'u2', name: 'Priya', avatar_url: null,
          balances: { INR: -400 },
          groups: [{ group_id: 'g3', group_name: 'Dinner', currency: 'INR', balance: -400 }],
        },
      ],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Aarav')).toBeInTheDocument())
    expect(screen.getByText('Priya')).toBeInTheDocument()
  })

  it('expanding a row shows per-group breakdown', async () => {
    apiGet.mockResolvedValueOnce({
      people: [
        {
          user_id: 'u1', name: 'Aarav', avatar_url: null,
          balances: { INR: 600 },
          groups: [{ group_id: 'g1', group_name: 'Goa Trip', currency: 'INR', balance: 600 }],
        },
      ],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Aarav')).toBeInTheDocument())
    // Goa Trip should not be visible yet (collapsed).
    expect(screen.queryByText('Goa Trip')).toBeNull()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    await waitFor(() => expect(screen.getByText('Goa Trip')).toBeInTheDocument())
  })

  it('clicking a group row navigates to that group', async () => {
    apiGet.mockResolvedValueOnce({
      people: [
        {
          user_id: 'u1', name: 'Aarav', avatar_url: null,
          balances: { INR: 600 },
          groups: [{ group_id: 'g123', group_name: 'Goa Trip', currency: 'INR', balance: 600 }],
        },
      ],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Aarav')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    await waitFor(() => expect(screen.getByText('Goa Trip')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Goa Trip').closest('button'))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/groups/g123')
  })

  it('renders error banner with retry on API failure', async () => {
    apiGet.mockRejectedValueOnce(new Error('Network down'))
    renderPage()
    await waitFor(() => expect(screen.getByText(/network down/i)).toBeInTheDocument())
    // After retry, second call succeeds.
    apiGet.mockResolvedValueOnce({ people: [] })
    fireEvent.click(screen.getByText(/retry/i))
    await waitFor(() => expect(screen.getByText(/all settled up/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/web && npx vitest run src/tests/pages/PeoplePage.test.jsx`
Expected: all 5 pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/tests/pages/PeoplePage.test.jsx
git commit -m "test(web): PeoplePage rendering, expand, navigation, error/retry"
```

---

## Phase 3: Deploy

### Task 3.1: Bump Android version + rebuild AAB + debug APK

**Files:**
- Modify: `apps/web/android/app/build.gradle`

- [ ] **Step 1: Bump versionCode and versionName**

In `apps/web/android/app/build.gradle`, change:

```groovy
        versionCode 9
        versionName "1.0.8"
```
to:
```groovy
        versionCode 10
        versionName "1.0.9"
```

- [ ] **Step 2: Build web + sync Capacitor + clean release bundle + debug APK**

Run:
```bash
cd /Users/rsumit123/work/chillbill/apps/web
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
npm run build
npx cap sync android
cd android
./gradlew clean assembleDebug bundleRelease
cp app/build/outputs/apk/debug/app-debug.apk ~/Downloads/halvio-1.0.9-debug.apk
cp app/build/outputs/bundle/release/app-release.aab ~/Downloads/halvio-1.0.9.aab
ls -lh ~/Downloads/halvio-1.0.9*
```
Expected: both files written, ~3.3 MB / ~4.5 MB respectively.

- [ ] **Step 3: Commit**

```bash
cd /Users/rsumit123/work/chillbill
git add apps/web/android/app/build.gradle
git commit -m "build(android): bump to versionCode 10 / 1.0.9 — cross-group People view"
git push origin main
```

End of plan.

---

## Done criteria

- ✅ Backend tests all pass (existing + new `test_people_balances.py`).
- ✅ Frontend builds without errors. New vitest passes.
- ✅ Backend deployed; `GET /api/v1/me/balances/people` returns 401 without auth, 200 with auth.
- ✅ Web: navigating to `/dashboard/people` shows the People tab; visiting via desktop nav and mobile dropdown both work; expanding a row shows per-group breakdown; tapping a group jumps to that group.
- ✅ AAB v1.0.9 (versionCode 10) ready to upload to Play Console.

---

## Out of scope (v2 candidates)

Per the spec:
- Cross-group "Settle all with X" batch endpoint + UI
- Optional currency conversion to a single display currency
- "Create new group with this person" shortcut
- Per-person history view across groups
- Pagination/search on the People list
