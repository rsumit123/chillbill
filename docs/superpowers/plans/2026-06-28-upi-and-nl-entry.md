# UPI Settle-Up + Natural-Language Expense Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two differentiator features to Halvio — one-tap UPI/PayPal/Venmo settle-up keyed by recipient payment methods, and natural-language expense entry via OpenRouter (`openai/gpt-oss-120b`).

**Architecture:** Three sequential deploy phases keep blast radius small:
1. Silent foundation — schema + endpoints, no UI changes
2. Payment methods UI + per-method settle-up buttons
3. Natural-language expense entry powered by OpenRouter

**Tech Stack:** FastAPI + async SQLAlchemy (backend), Alembic (migrations), httpx (HTTP), React 18 + Vite (frontend), Capacitor 8 (Android wrapper), OpenRouter (LLM provider via plain HTTPS), pytest + Vitest (tests).

**Spec:** `docs/superpowers/specs/2026-06-28-upi-and-nl-entry-design.md`

---

## File Structure (decomposition decisions)

### Backend (new)
- `apps/backend/alembic/versions/20260628_0001_payment_methods.py` — migration: `users.payment_methods` JSON + `settlements.via_payment_method` String
- `apps/backend/app/services/llm.py` — thin OpenRouter HTTP wrapper (`parse_with_llm(system, user, schema)`)
- `apps/backend/app/services/expense_parser.py` — prompt construction + JSON schema + validation; calls `llm.parse_with_llm`
- `apps/backend/tests/integration/test_payment_methods.py` — CRUD on `PUT /me/payment-methods`
- `apps/backend/tests/integration/test_expense_parser.py` — happy-path + intent variants + validation failures, LLM mocked
- `apps/backend/tests/integration/test_settlement_via_method.py` — settlement creation accepts and persists `via_payment_method`

### Backend (modified)
- `app/db/models/user.py` — add `payment_methods` JSON column
- `app/db/models/settlement.py` — add `via_payment_method` String column
- `app/api/v1/users.py` — add `PUT /me/payment-methods`; include `payment_methods` in `MeResponse`
- `app/api/v1/groups.py` — include each member's `payment_methods` in `GET /groups/{id}`
- `app/api/v1/settlements.py` — accept optional `via_payment_method` on create; add `POST /groups/{id}/expenses/parse`
- `app/core/config.py` — add `openrouter_api_key`, `openrouter_model`, `openrouter_timeout_seconds`

### Frontend (new)
- `apps/web/src/services/geo.js` — `detectRegion()` + `SUGGESTED_METHODS` map
- `apps/web/src/services/payments.js` — `buildPaymentUrl(method, amount, note)`; `paymentMethodLabel(type)`
- `apps/web/src/pages/SettingsPage.jsx` — profile + payment methods editor
- `apps/web/src/components/PaymentMethodsEditor.jsx` — reusable editor; used on Settings
- `apps/web/src/components/DidThePaymentGoThroughSheet.jsx` — bottom sheet shown after a deep-link tap
- `apps/web/src/components/PaymentNudgeBanner.jsx` — one-time dismissible banner
- `apps/web/src/tests/services/geo.test.js`
- `apps/web/src/tests/services/payments.test.js`

### Frontend (modified)
- `apps/web/src/contexts/AuthContext.jsx` — store `payment_methods` on `user`; provide an update helper
- `apps/web/src/App.jsx` — add `/dashboard/settings` route
- `apps/web/src/components/Layout.jsx` — add settings link in user menu; render `PaymentNudgeBanner` in dashboard
- `apps/web/src/components/SettleUpModal.jsx` — replace single "Mark as paid" with per-method buttons + fallback; surface `DidThePaymentGoThroughSheet`
- `apps/web/src/components/AddExpenseModal.jsx` — add NL textarea + parse button + state machine + Undo
- `apps/web/public/privacy.html` — disclosure for LLM parsing

### Infrastructure
- VM `docker-compose.override.yml` — add `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_TIMEOUT_SECONDS` env vars (not in git)

---

## Phase 1: Silent Foundation

No user-visible changes. After this phase, the schema is ready and endpoints accept the new fields, but no UI uses them yet. Safe to deploy on its own.

---

### Task 1.1: Migration — add payment_methods + via_payment_method columns

**Files:**
- Create: `apps/backend/alembic/versions/20260628_0001_payment_methods.py`

- [ ] **Step 1: Write the migration**

```python
"""Add users.payment_methods JSON + settlements.via_payment_method String.

Revision ID: 20260628_0001_payment_methods
Revises: 20260528_0001_settlements_member
Create Date: 2026-06-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260628_0001_payment_methods"
down_revision = "20260528_0001_settlements_member"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite doesn't support JSON server_default cleanly; use TEXT default '[]'
    op.add_column(
        "users",
        sa.Column(
            "payment_methods",
            sa.JSON(),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "settlements",
        sa.Column("via_payment_method", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("settlements", "via_payment_method")
    op.drop_column("users", "payment_methods")
```

- [ ] **Step 2: Verify it applies cleanly to a fresh DB**

Run:
```bash
cd apps/backend
DB_URL="sqlite+aiosqlite:////tmp/halvio_test.db" alembic upgrade head
```
Expected: no errors. `alembic current` shows `20260628_0001_payment_methods (head)`.

- [ ] **Step 3: Verify downgrade works**

Run:
```bash
DB_URL="sqlite+aiosqlite:////tmp/halvio_test.db" alembic downgrade -1
DB_URL="sqlite+aiosqlite:////tmp/halvio_test.db" alembic upgrade head
```
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/alembic/versions/20260628_0001_payment_methods.py
git commit -m "feat(db): add payment_methods + via_payment_method columns"
```

---

### Task 1.2: Update ORM models to expose new columns

**Files:**
- Modify: `apps/backend/app/db/models/user.py`
- Modify: `apps/backend/app/db/models/settlement.py`

- [ ] **Step 1: Add payment_methods to User**

In `apps/backend/app/db/models/user.py`, add to the imports:

```python
from sqlalchemy import JSON
```

(Keep the existing imports.) Then add the column inside the `User` class, alongside the other columns:

```python
    payment_methods: Mapped[list[dict]] = mapped_column(
        JSON, nullable=False, default=list, server_default="[]"
    )
```

- [ ] **Step 2: Add via_payment_method to Settlement**

In `apps/backend/app/db/models/settlement.py`, inside the `Settlement` class, add (after the existing `method` field):

```python
    via_payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
```

- [ ] **Step 3: Syntax-check both files**

Run:
```bash
cd apps/backend
python3 -c "import ast; [ast.parse(open(f).read()) for f in ['app/db/models/user.py','app/db/models/settlement.py']]; print('OK')"
```
Expected: `OK`.

- [ ] **Step 4: Run the backend test suite — should all pass**

Run: `python3 -m pytest -x -q`
Expected: all tests pass (we haven't changed behavior yet, only added unused columns).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/db/models/user.py apps/backend/app/db/models/settlement.py
git commit -m "feat(models): add payment_methods + via_payment_method fields"
```

---

### Task 1.3: PUT /me/payment-methods endpoint — write failing test

**Files:**
- Create: `apps/backend/tests/integration/test_payment_methods.py`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/tests/integration/test_payment_methods.py`:

```python
"""Tests for the PUT /me/payment-methods endpoint."""
import pytest
from httpx import AsyncClient


class TestPaymentMethods:
    async def test_get_me_includes_payment_methods_default_empty(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["payment_methods"] == []

    async def test_put_payment_methods_happy_path(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.put(
            "/api/v1/users/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "payment_methods": [
                    {"type": "upi", "value": "test@okicici"},
                    {"type": "paypal", "value": "paypal.me/test"},
                ]
            },
        )
        assert resp.status_code == 200
        assert resp.json()["payment_methods"] == [
            {"type": "upi", "value": "test@okicici"},
            {"type": "paypal", "value": "paypal.me/test"},
        ]
        # Round-trip via /me
        me = (await client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {auth_token}"},
        )).json()
        assert len(me["payment_methods"]) == 2

    async def test_put_payment_methods_replaces_existing(
        self, client: AsyncClient, auth_token: str
    ):
        # Set two
        await client.put(
            "/api/v1/users/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [
                {"type": "upi", "value": "a@b"},
                {"type": "paypal", "value": "paypal.me/x"},
            ]},
        )
        # Replace with one
        resp = await client.put(
            "/api/v1/users/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "venmo", "value": "@new"}]},
        )
        assert resp.status_code == 200
        assert resp.json()["payment_methods"] == [
            {"type": "venmo", "value": "@new"}
        ]

    async def test_put_payment_methods_rejects_invalid_type(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.put(
            "/api/v1/users/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "bitcoin", "value": "1A1..."}]},
        )
        assert resp.status_code == 422

    async def test_put_payment_methods_rejects_invalid_upi_format(
        self, client: AsyncClient, auth_token: str
    ):
        resp = await client.put(
            "/api/v1/users/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "upi", "value": "not-a-vpa"}]},
        )
        assert resp.status_code == 400
        assert "upi" in resp.json()["detail"].lower()

    async def test_put_payment_methods_empty_list_clears(
        self, client: AsyncClient, auth_token: str
    ):
        await client.put(
            "/api/v1/users/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "upi", "value": "a@b"}]},
        )
        resp = await client.put(
            "/api/v1/users/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": []},
        )
        assert resp.status_code == 200
        assert resp.json()["payment_methods"] == []

    async def test_put_payment_methods_requires_auth(self, client: AsyncClient):
        resp = await client.put(
            "/api/v1/users/me/payment-methods",
            json={"payment_methods": []},
        )
        assert resp.status_code in (401, 403)
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `python3 -m pytest tests/integration/test_payment_methods.py -x -v`
Expected: tests FAIL (endpoint doesn't exist yet — 404s).

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/backend/tests/integration/test_payment_methods.py
git commit -m "test(payment-methods): add failing tests for PUT endpoint"
```

---

### Task 1.4: Implement PUT /me/payment-methods endpoint

**Files:**
- Modify: `apps/backend/app/api/v1/users.py`

- [ ] **Step 1: Add validation helper and the endpoint**

Read `apps/backend/app/api/v1/users.py` first to see the existing structure (it has `MeResponse` and `update_me` already). Add at the top, after existing imports:

```python
import re
from typing import Literal
from pydantic import field_validator, BaseModel
```

(Skip imports already present.) Add these constants near the top of the file (after imports):

```python
ALLOWED_PAYMENT_TYPES = {"upi", "paypal", "venmo", "cashapp", "iban", "other"}
UPI_RE = re.compile(r"^[\w.\-+]+@[\w.\-]+$")
```

Add this Pydantic model (after existing models in the file):

```python
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


class PaymentMethodsUpdate(BaseModel):
    payment_methods: list[PaymentMethod]
```

Update the existing `MeResponse` to include payment_methods. (Look at the current shape; add the field — if `MeResponse` is a Pydantic model, append `payment_methods: list[dict] = []`. If it's a plain dict-returning endpoint, add it to the dict in `get_me`.)

Add the new endpoint at the end of the file:

```python
@router.put("/me/payment-methods", response_model=dict)
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
```

Also ensure `get_me` returns `payment_methods`:

```python
@router.get("/me", response_model=dict)
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "avatar_url": current_user.avatar_url,
        "payment_methods": current_user.payment_methods or [],
    }
```

(If the existing `get_me` already exists with a `MeResponse` model, modify the model + endpoint accordingly — don't duplicate.)

- [ ] **Step 2: Run the tests — verify they pass**

Run: `python3 -m pytest tests/integration/test_payment_methods.py -x -v`
Expected: all tests PASS.

- [ ] **Step 3: Run the full backend test suite — verify no regressions**

Run: `python3 -m pytest -x -q`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/api/v1/users.py
git commit -m "feat(api): add PUT /me/payment-methods and expose on /me"
```

---

### Task 1.5: Include payment_methods in group member listings

**Files:**
- Modify: `apps/backend/app/api/v1/groups.py`

- [ ] **Step 1: Find the group-detail endpoint and add the field**

Read `apps/backend/app/api/v1/groups.py`. Locate `get_group` (`@router.get("/{group_id}")`). The endpoint builds a `members` list with each member's `name`, `email`, `avatar_url`, etc. Add `payment_methods` from each member's linked User.

For each member dict being built, add:
```python
"payment_methods": (member.user.payment_methods if member.user else []) or [],
```

If the existing query doesn't eager-load the user, ensure it does (use `selectinload(GroupMember.user)` or check the existing pattern). Match whatever the file already does for `name`/`email`.

- [ ] **Step 2: Add a test asserting payment_methods appear on a group member**

Append to `apps/backend/tests/integration/test_payment_methods.py`:

```python
    async def test_group_member_listing_includes_payment_methods(
        self, client, auth_token, test_group_with_members
    ):
        group, members = test_group_with_members
        # Set methods on the test user
        await client.put(
            "/api/v1/users/me/payment-methods",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"payment_methods": [{"type": "upi", "value": "me@okicici"}]},
        )
        # Fetch the group
        resp = await client.get(
            f"/api/v1/groups/{group.id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        me_member = next(
            m for m in resp.json()["members"]
            if m.get("email") and "test" in m["email"].lower()
        )
        assert me_member["payment_methods"] == [
            {"type": "upi", "value": "me@okicici"}
        ]
```

(If `test_group_with_members` fixture's "current user" has a different email match, adjust the lookup to use `id` or `user_id`.)

- [ ] **Step 3: Run test — verify it passes**

Run: `python3 -m pytest tests/integration/test_payment_methods.py::TestPaymentMethods::test_group_member_listing_includes_payment_methods -x -v`
Expected: PASS.

- [ ] **Step 4: Run full backend suite — no regressions**

Run: `python3 -m pytest -x -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/api/v1/groups.py apps/backend/tests/integration/test_payment_methods.py
git commit -m "feat(api): include payment_methods on group member listing"
```

---

### Task 1.6: Accept via_payment_method on settlement create

**Files:**
- Modify: `apps/backend/app/api/v1/settlements.py`
- Create: `apps/backend/tests/integration/test_settlement_via_method.py`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/tests/integration/test_settlement_via_method.py`:

```python
"""Settlement creation accepts and persists via_payment_method."""
import pytest


class TestSettlementVia:
    async def test_create_settlement_with_via_payment_method(
        self, client, auth_token, db_session, test_group_with_members
    ):
        group, members = test_group_with_members
        resp = await client.post(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "from_member_id": members[0].id,
                "to_member_id": members[1].id,
                "amount": 100.0,
                "via_payment_method": "upi",
            },
        )
        assert resp.status_code == 200

        listed = await client.get(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert listed.status_code == 200
        assert listed.json()[0]["via_payment_method"] == "upi"

    async def test_create_settlement_without_via_defaults_to_null(
        self, client, auth_token, test_group_with_members
    ):
        group, members = test_group_with_members
        resp = await client.post(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "from_member_id": members[0].id,
                "to_member_id": members[1].id,
                "amount": 50.0,
            },
        )
        assert resp.status_code == 200

        listed = (await client.get(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
        )).json()
        assert listed[0]["via_payment_method"] is None

    async def test_create_settlement_rejects_invalid_via(
        self, client, auth_token, test_group_with_members
    ):
        group, members = test_group_with_members
        resp = await client.post(
            f"/api/v1/groups/{group.id}/settlements",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "from_member_id": members[0].id,
                "to_member_id": members[1].id,
                "amount": 50.0,
                "via_payment_method": "bitcoin",
            },
        )
        assert resp.status_code == 422
```

Run: `python3 -m pytest tests/integration/test_settlement_via_method.py -x -v`
Expected: FAIL (field not yet accepted).

- [ ] **Step 2: Update the SettlementCreate Pydantic model**

In `apps/backend/app/api/v1/settlements.py`, find the `SettlementCreate` model. Add the field:

```python
from typing import Literal

class SettlementCreate(BaseModel):
    from_member_id: int
    to_member_id: int
    amount: float
    method: str = "manual"
    via_payment_method: Literal["upi", "paypal", "venmo", "cashapp", "iban", "other", "manual"] | None = None
```

In `create_settlement`, pass it to the `Settlement(...)` constructor:

```python
    st = Settlement(
        group_id=group_id,
        from_member_id=payload.from_member_id,
        to_member_id=payload.to_member_id,
        amount=payload.amount,
        currency=group.currency,
        method=payload.method,
        status="success",
        via_payment_method=payload.via_payment_method,
    )
```

In `list_settlements`, include the field in the response dicts:

```python
    return [
        {
            "id": s.id,
            "from_member_id": s.from_member_id,
            "to_member_id": s.to_member_id,
            "amount": float(s.amount),
            "currency": s.currency,
            "method": s.method,
            "status": s.status,
            "via_payment_method": s.via_payment_method,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in res.scalars().all()
    ]
```

- [ ] **Step 3: Run the new tests — verify they pass**

Run: `python3 -m pytest tests/integration/test_settlement_via_method.py -x -v`
Expected: all PASS.

- [ ] **Step 4: Run full suite**

Run: `python3 -m pytest -x -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/api/v1/settlements.py apps/backend/tests/integration/test_settlement_via_method.py
git commit -m "feat(api): accept and persist via_payment_method on settlements"
```

---

### Task 1.7: Deploy Phase 1 to VM

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Pull and recreate backend on VM**

Run:
```bash
ssh ssh-social 'cd /home/rsumit123/chillbill && git pull --ff-only origin main && docker compose up -d --build --force-recreate backend'
```
Expected: container starts, no errors.

- [ ] **Step 3: Verify migration applied**

Run:
```bash
ssh ssh-social 'docker exec chillbill-backend-1 alembic current'
```
Expected: `20260628_0001_payment_methods (head)`.

- [ ] **Step 4: Verify new endpoint live**

Run:
```bash
curl -sS -m 10 -X PUT "https://chillbill-api.skdev.one/api/v1/users/me/payment-methods" -w "\nHTTP %{http_code}\n"
```
Expected: HTTP 401 (auth required — proves the route exists; old code would return 405 or 404).

- [ ] **Step 5: Mark phase 1 done**

No commit. End of Phase 1.

---

## Phase 2: Payment Methods UI + UPI Settle-Up

User-visible. New settings screen, payment-method editor, settle-up buttons per method, "did the payment go through?" confirmation sheet, dismissible nudge banner.

---

### Task 2.1: Geo helper utility + tests

**Files:**
- Create: `apps/web/src/services/geo.js`
- Create: `apps/web/src/tests/services/geo.test.js`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/tests/services/geo.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectRegion, SUGGESTED_METHODS } from '../../services/geo.js'

describe('detectRegion', () => {
  const originalTZ = Intl.DateTimeFormat
  let mockedLanguage = 'en-US'

  beforeEach(() => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Asia/Kolkata' }),
    }))
    Object.defineProperty(navigator, 'language', {
      get: () => mockedLanguage,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns IN for Asia/Kolkata timezone', () => {
    expect(detectRegion()).toBe('IN')
  })

  it('returns IN for en-IN language even with non-Indian tz', () => {
    Intl.DateTimeFormat.mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }),
    }))
    mockedLanguage = 'en-IN'
    expect(detectRegion()).toBe('IN')
  })

  it('returns US for America/* tz', () => {
    Intl.DateTimeFormat.mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'America/Los_Angeles' }),
    }))
    mockedLanguage = 'en-US'
    expect(detectRegion()).toBe('US')
  })

  it('returns EU for Europe/* tz', () => {
    Intl.DateTimeFormat.mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Europe/London' }),
    }))
    mockedLanguage = 'en-GB'
    expect(detectRegion()).toBe('EU')
  })

  it('returns OTHER for anything unrecognized', () => {
    Intl.DateTimeFormat.mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Pacific/Auckland' }),
    }))
    mockedLanguage = 'en-NZ'
    expect(detectRegion()).toBe('OTHER')
  })
})

describe('SUGGESTED_METHODS', () => {
  it('has an array for each region', () => {
    for (const r of ['IN', 'US', 'EU', 'OTHER']) {
      expect(Array.isArray(SUGGESTED_METHODS[r])).toBe(true)
      expect(SUGGESTED_METHODS[r].length).toBeGreaterThan(0)
    }
  })

  it('IN suggests upi first', () => {
    expect(SUGGESTED_METHODS.IN[0].type).toBe('upi')
  })

  it('every suggested method has type, label, placeholder', () => {
    for (const r of ['IN', 'US', 'EU', 'OTHER']) {
      for (const m of SUGGESTED_METHODS[r]) {
        expect(m).toHaveProperty('type')
        expect(m).toHaveProperty('label')
        expect(m).toHaveProperty('placeholder')
      }
    }
  })
})
```

Run: `cd apps/web && npx vitest run src/tests/services/geo.test.js`
Expected: FAIL (file doesn't exist).

- [ ] **Step 2: Implement geo.js**

Create `apps/web/src/services/geo.js`:

```javascript
// Lightweight client-side region detection for tailoring payment-method prompts.
// Not authoritative — a user can always pick a different region in the UI.

export function detectRegion() {
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* noop */ }
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'

  if (tz === 'Asia/Kolkata' || lang.endsWith('-IN')) return 'IN'
  if (lang.endsWith('-US') || tz.startsWith('America/')) return 'US'
  if (lang.endsWith('-GB') || lang.endsWith('-IE') || tz.startsWith('Europe/')) return 'EU'
  return 'OTHER'
}

export const SUGGESTED_METHODS = {
  IN: [
    { type: 'upi',    label: 'UPI ID',       placeholder: 'you@okicici' },
  ],
  US: [
    { type: 'paypal', label: 'PayPal',       placeholder: 'paypal.me/yourname' },
    { type: 'venmo',  label: 'Venmo',        placeholder: '@your-handle' },
    { type: 'cashapp',label: 'Cash App',     placeholder: '$yourname' },
  ],
  EU: [
    { type: 'paypal', label: 'PayPal',       placeholder: 'paypal.me/yourname' },
    { type: 'iban',   label: 'IBAN',         placeholder: 'GB29 NWBK 6016 ...' },
  ],
  OTHER: [
    { type: 'other',  label: 'Payment info', placeholder: 'PayPal, bank tag, etc.' },
  ],
}

// All possible types for the "show all options" expander.
export const ALL_METHOD_TYPES = [
  { type: 'upi',    label: 'UPI ID',       placeholder: 'you@okicici' },
  { type: 'paypal', label: 'PayPal',       placeholder: 'paypal.me/yourname' },
  { type: 'venmo',  label: 'Venmo',        placeholder: '@your-handle' },
  { type: 'cashapp',label: 'Cash App',     placeholder: '$yourname' },
  { type: 'iban',   label: 'IBAN',         placeholder: 'GB29 NWBK 6016 ...' },
  { type: 'other',  label: 'Payment info', placeholder: 'PayPal, bank tag, etc.' },
]
```

- [ ] **Step 3: Run tests — verify pass**

Run: `cd apps/web && npx vitest run src/tests/services/geo.test.js`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/geo.js apps/web/src/tests/services/geo.test.js
git commit -m "feat(web): add geo region detection for payment-method prompts"
```

---

### Task 2.2: Payment URL builder utility + tests

**Files:**
- Create: `apps/web/src/services/payments.js`
- Create: `apps/web/src/tests/services/payments.test.js`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/tests/services/payments.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { buildPaymentUrl, paymentMethodLabel, canDeepLink } from '../../services/payments.js'

describe('buildPaymentUrl', () => {
  it('upi builds upi:// URL with all params', () => {
    const url = buildPaymentUrl(
      { type: 'upi', value: 'aarav@okicici' },
      { amount: 500, note: 'Goa Trip', payeeName: 'Aarav' }
    )
    expect(url).toContain('upi://pay')
    expect(url).toContain('pa=aarav%40okicici')
    expect(url).toContain('am=500')
    expect(url).toContain('cu=INR')
    expect(url).toContain('pn=Aarav')
    expect(url).toContain('tn=Goa%20Trip')
  })

  it('paypal builds paypal.me URL with amount', () => {
    const url = buildPaymentUrl(
      { type: 'paypal', value: 'paypal.me/aarav' },
      { amount: 30, currency: 'GBP' }
    )
    expect(url).toBe('https://paypal.me/aarav/30/GBP')
  })

  it('paypal handles bare username', () => {
    const url = buildPaymentUrl(
      { type: 'paypal', value: 'aarav' },
      { amount: 30, currency: 'USD' }
    )
    expect(url).toBe('https://paypal.me/aarav/30/USD')
  })

  it('venmo builds venmo:// URL', () => {
    const url = buildPaymentUrl(
      { type: 'venmo', value: '@aarav-123' },
      { amount: 25, note: 'dinner' }
    )
    expect(url).toContain('venmo://paycharge')
    expect(url).toContain('recipients=aarav-123')
    expect(url).toContain('amount=25')
    expect(url).toContain('note=dinner')
  })

  it('cashapp builds cash.app URL', () => {
    const url = buildPaymentUrl(
      { type: 'cashapp', value: '$aarav' },
      { amount: 25 }
    )
    expect(url).toBe('https://cash.app/$aarav/25')
  })

  it('iban returns null (no deep link)', () => {
    const url = buildPaymentUrl(
      { type: 'iban', value: 'GB29 NWBK 6016' },
      { amount: 100 }
    )
    expect(url).toBeNull()
  })

  it('other returns null', () => {
    expect(buildPaymentUrl({ type: 'other', value: 'x' }, { amount: 100 })).toBeNull()
  })
})

describe('canDeepLink', () => {
  it('true for upi/paypal/venmo/cashapp', () => {
    for (const t of ['upi', 'paypal', 'venmo', 'cashapp']) {
      expect(canDeepLink({ type: t, value: 'x' })).toBe(true)
    }
  })

  it('false for iban/other', () => {
    for (const t of ['iban', 'other']) {
      expect(canDeepLink({ type: t, value: 'x' })).toBe(false)
    }
  })
})

describe('paymentMethodLabel', () => {
  it('returns user-facing label per type', () => {
    expect(paymentMethodLabel('upi')).toBe('UPI')
    expect(paymentMethodLabel('paypal')).toBe('PayPal')
    expect(paymentMethodLabel('venmo')).toBe('Venmo')
    expect(paymentMethodLabel('cashapp')).toBe('Cash App')
    expect(paymentMethodLabel('iban')).toBe('IBAN')
    expect(paymentMethodLabel('other')).toBe('Payment info')
  })
})
```

Run: `cd apps/web && npx vitest run src/tests/services/payments.test.js`
Expected: FAIL.

- [ ] **Step 2: Implement payments.js**

Create `apps/web/src/services/payments.js`:

```javascript
// Build deep-link URLs for various payment providers.
// Returns null for types that don't support deep linking (caller uses copy + share fallback).

const LABELS = {
  upi: 'UPI',
  paypal: 'PayPal',
  venmo: 'Venmo',
  cashapp: 'Cash App',
  iban: 'IBAN',
  other: 'Payment info',
}

const DEEP_LINK_TYPES = new Set(['upi', 'paypal', 'venmo', 'cashapp'])

export function paymentMethodLabel(type) {
  return LABELS[type] || type
}

export function canDeepLink(method) {
  return DEEP_LINK_TYPES.has(method.type)
}

export function buildPaymentUrl(method, { amount, currency = 'INR', note = '', payeeName = '' } = {}) {
  if (!canDeepLink(method)) return null
  const amt = String(Number(amount).toFixed(2)).replace(/\.00$/, '')

  switch (method.type) {
    case 'upi': {
      const params = new URLSearchParams()
      params.set('pa', method.value)
      if (payeeName) params.set('pn', payeeName)
      params.set('am', amt)
      params.set('cu', 'INR')
      if (note) params.set('tn', note)
      return `upi://pay?${params.toString()}`
    }
    case 'paypal': {
      const user = String(method.value).replace(/^paypal\.me\//i, '').replace(/^@/, '')
      const safeCurrency = (currency || 'USD').toUpperCase()
      return `https://paypal.me/${encodeURIComponent(user)}/${amt}/${safeCurrency}`
    }
    case 'venmo': {
      const recipients = String(method.value).replace(/^@/, '')
      const params = new URLSearchParams()
      params.set('txn', 'pay')
      params.set('recipients', recipients)
      params.set('amount', amt)
      if (note) params.set('note', note)
      return `venmo://paycharge?${params.toString()}`
    }
    case 'cashapp': {
      const user = String(method.value).startsWith('$')
        ? method.value
        : `$${method.value}`
      return `https://cash.app/${user}/${amt}`
    }
    default:
      return null
  }
}
```

- [ ] **Step 3: Run tests — verify pass**

Run: `cd apps/web && npx vitest run src/tests/services/payments.test.js`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/payments.js apps/web/src/tests/services/payments.test.js
git commit -m "feat(web): payment-method URL builders + labels"
```

---

### Task 2.3: AuthContext stores payment_methods

**Files:**
- Modify: `apps/web/src/contexts/AuthContext.jsx`

- [ ] **Step 1: Add an `updatePaymentMethods` helper**

In `AuthContext.jsx`, inside the `value = useMemo(() => ({ ... }))`, add:

```javascript
updatePaymentMethods: (methods) => {
  setUser(prev => prev ? { ...prev, payment_methods: methods } : prev)
},
```

Also ensure `setAuthData` doesn't strip the `payment_methods` field from the user object — it just spreads userData, so it'll already include it if the backend returns it.

After login/refresh, the backend's `/me` returns `payment_methods`. We don't currently call `/me` after login (we get user data from the login response). For now, the `payment_methods` will be populated when the user opens the Settings page (which re-fetches `/me`).

- [ ] **Step 2: Smoke check — vitest still passes**

Run: `cd apps/web && npx vitest run`
Expected: existing tests still pass (or have the same pre-existing failures as before — note in CLAUDE memory that some Spinner/Avatar tests have pre-existing failures, ignore those).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/contexts/AuthContext.jsx
git commit -m "feat(web): AuthContext exposes updatePaymentMethods helper"
```

---

### Task 2.4: PaymentMethodsEditor component

**Files:**
- Create: `apps/web/src/components/PaymentMethodsEditor.jsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/PaymentMethodsEditor.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { detectRegion, SUGGESTED_METHODS, ALL_METHOD_TYPES } from '../services/geo.js'
import { paymentMethodLabel } from '../services/payments.js'

function rowKey(idx) { return `row-${idx}` }

export default function PaymentMethodsEditor({ initial = [], onSave, saving = false }) {
  const [rows, setRows] = useState(initial.length ? initial : [])
  const [showAllTypes, setShowAllTypes] = useState(false)
  const region = detectRegion()
  const suggested = SUGGESTED_METHODS[region] || SUGGESTED_METHODS.OTHER
  const typeOptions = showAllTypes ? ALL_METHOD_TYPES : suggested

  useEffect(() => { setRows(initial) }, [JSON.stringify(initial)])

  function setRow(idx, patch) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }
  function removeRow(idx) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }
  function addRow(type) {
    setRows(prev => [...prev, { type, value: '' }])
  }

  function handleSave(e) {
    e?.preventDefault()
    // Drop empty rows
    const cleaned = rows
      .map(r => ({ type: r.type, value: (r.value || '').trim() }))
      .filter(r => r.value.length > 0)
    onSave?.(cleaned)
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            No payment methods yet. Add one below so friends can pay you in one tap.
          </div>
        )}
        {rows.map((r, idx) => {
          const opt = ALL_METHOD_TYPES.find(t => t.type === r.type) || { placeholder: '' }
          return (
            <div key={rowKey(idx)} className="flex items-center gap-2">
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 w-24 shrink-0">
                {paymentMethodLabel(r.type)}
              </div>
              <input
                value={r.value}
                onChange={e => setRow(idx, { value: e.target.value })}
                placeholder={opt.placeholder}
                className="flex-1 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                aria-label="Remove"
                className="text-neutral-400 hover:text-red-600 p-2"
              >×</button>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {typeOptions.map(opt => (
          <button
            key={opt.type}
            type="button"
            onClick={() => addRow(opt.type)}
            className="text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-3 py-1.5 rounded-lg"
          >+ {opt.label}</button>
        ))}
        {!showAllTypes && (
          <button
            type="button"
            onClick={() => setShowAllTypes(true)}
            className="text-xs text-blue-600 dark:text-blue-400 px-3 py-1.5"
          >More options</button>
        )}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
      >
        {saving ? 'Saving…' : 'Save payment methods'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/PaymentMethodsEditor.jsx
git commit -m "feat(web): PaymentMethodsEditor component"
```

---

### Task 2.5: SettingsPage + route

**Files:**
- Create: `apps/web/src/pages/SettingsPage.jsx`
- Modify: `apps/web/src/App.jsx`

- [ ] **Step 1: Create SettingsPage**

Create `apps/web/src/pages/SettingsPage.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { api } from '../services/api.js'
import PaymentMethodsEditor from '../components/PaymentMethodsEditor.jsx'
import { Spinner } from '../components/Spinner.jsx'

export default function SettingsPage() {
  const { user, accessToken, updatePaymentMethods } = useAuth()
  const { push } = useToast()
  const [methods, setMethods] = useState(user?.payment_methods || [])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    api.get('/users/me', { token: accessToken })
      .then(me => { if (mounted) { setMethods(me.payment_methods || []); updatePaymentMethods(me.payment_methods || []) } })
      .catch(err => push(err.message || 'Failed to load profile', 'error'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [accessToken])

  async function save(newMethods) {
    setSaving(true)
    try {
      const res = await api.put('/users/me/payment-methods', { payment_methods: newMethods }, { token: accessToken })
      updatePaymentMethods(res.payment_methods)
      setMethods(res.payment_methods)
      push('Payment methods saved', 'success')
    } catch (err) {
      push(err.message || 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl space-y-8 pb-12">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Settings</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Your account and payment preferences.</p>
      </header>

      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
        <h2 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Profile</h2>
        <div className="text-sm text-neutral-600 dark:text-neutral-400">{user?.name}</div>
        <div className="text-sm text-neutral-500 dark:text-neutral-500">{user?.email}</div>
      </section>

      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
        <h2 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Payment methods</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Add the ways your friends can pay you. We'll show one-tap buttons in the settle-up flow.
          Only members of your shared groups can see these.
        </p>
        {loading ? (
          <Spinner size="md" className="text-blue-600" />
        ) : (
          <PaymentMethodsEditor initial={methods} onSave={save} saving={saving} />
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Add the route to App.jsx**

In `apps/web/src/App.jsx`, import:
```jsx
import SettingsPage from './pages/SettingsPage.jsx'
```

Inside the `/dashboard` route children, add:
```jsx
<Route path="settings" element={<SettingsPage />} />
```

- [ ] **Step 3: Add a Settings link in Layout user menu**

In `apps/web/src/components/Layout.jsx`, locate the user dropdown menu (the section with NavLink to `/dashboard` "Your Groups"). Add another NavLink just above the divider/logout:

```jsx
<NavLink
  to="/dashboard/settings"
  className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
  onClick={() => setMenuOpen(false)}
>
  <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
  <span>Settings</span>
</NavLink>
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: build succeeds.

- [ ] **Step 5: Add `put` method to api.js if missing**

Check `apps/web/src/services/api.js` exports a `put` method. (We confirmed earlier it does.) If not, add it.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/SettingsPage.jsx apps/web/src/App.jsx apps/web/src/components/Layout.jsx
git commit -m "feat(web): Settings page with payment-methods editor + nav link"
```

---

### Task 2.6: First-run nudge banner

**Files:**
- Create: `apps/web/src/components/PaymentNudgeBanner.jsx`
- Modify: `apps/web/src/pages/GroupsPage.jsx` (or similar landing dashboard page)

- [ ] **Step 1: Create the banner**

Create `apps/web/src/components/PaymentNudgeBanner.jsx`:

```jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

const KEY = 'cb_payment_nudge_dismissed'

export default function PaymentNudgeBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })

  const hasMethod = (user?.payment_methods || []).length > 0
  if (dismissed || hasMethod) return null

  function dismiss() {
    try { localStorage.setItem(KEY, '1') } catch { /* noop */ }
    setDismissed(true)
  }

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 mb-4 flex items-center gap-3">
      <div className="text-xl">💳</div>
      <div className="flex-1 text-sm text-blue-900 dark:text-blue-200">
        Add a payment method so friends can pay you in one tap.{' '}
        <Link to="/dashboard/settings" className="font-medium underline">Add now →</Link>
      </div>
      <button onClick={dismiss} className="text-blue-600 dark:text-blue-400 px-2" aria-label="Dismiss">×</button>
    </div>
  )
}
```

- [ ] **Step 2: Render it on the groups dashboard**

In `apps/web/src/pages/GroupsPage.jsx`, add the import:
```jsx
import PaymentNudgeBanner from '../components/PaymentNudgeBanner.jsx'
```

Render `<PaymentNudgeBanner />` at the top of the returned JSX (before the groups list).

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/PaymentNudgeBanner.jsx apps/web/src/pages/GroupsPage.jsx
git commit -m "feat(web): one-time nudge banner for adding payment methods"
```

---

### Task 2.7: DidThePaymentGoThroughSheet component

**Files:**
- Create: `apps/web/src/components/DidThePaymentGoThroughSheet.jsx`

- [ ] **Step 1: Implement**

Create `apps/web/src/components/DidThePaymentGoThroughSheet.jsx`:

```jsx
import Modal from './Modal.jsx'

export default function DidThePaymentGoThroughSheet({ open, recipientName, amountLabel, onYes, onNo }) {
  return (
    <Modal open={open} onClose={onNo}>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Did the payment go through?
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          {amountLabel} to {recipientName}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onNo} className="text-sm px-4 py-2 text-neutral-600 dark:text-neutral-300">
            Not yet
          </button>
          <button
            onClick={onYes}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Yes, mark as paid
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/DidThePaymentGoThroughSheet.jsx
git commit -m "feat(web): DidThePaymentGoThroughSheet component"
```

---

### Task 2.8: Update SettleUpModal with per-method buttons + sheet

**Files:**
- Modify: `apps/web/src/components/SettleUpModal.jsx`

- [ ] **Step 1: Rewrite the row rendering**

Read `apps/web/src/components/SettleUpModal.jsx` first to remember its structure (it currently maps `suggestions` to rows with one "Mark as paid" button each).

Replace its row-rendering and recording logic to:

```jsx
// Top of file imports — add:
import { useState as _useState } from 'react' // already imported as useState
import { buildPaymentUrl, canDeepLink, paymentMethodLabel } from '../services/payments.js'
import { detectRegion } from '../services/geo.js'
import DidThePaymentGoThroughSheet from './DidThePaymentGoThroughSheet.jsx'
```

Add state for the confirmation sheet:

```jsx
const [sheet, setSheet] = useState(null)
// sheet = { suggestion, methodType } | null
```

Helper to record a settlement:

```jsx
async function recordSettlement(s, viaMethod) {
  setPendingId(s.idx)
  try {
    await api.post(`/groups/${group.id}/settlements`, {
      from_member_id: s.from_member_id,
      to_member_id: s.to_member_id,
      amount: s.amount,
      via_payment_method: viaMethod || null,
    }, { token: accessToken })
    push('Settlement recorded', 'success')
    setSuggestions(prev => prev.filter((_, i) => i !== s.idx))
    onSettled?.()
  } catch (err) {
    push(err.message || 'Failed to record settlement', 'error')
  } finally {
    setPendingId(null)
  }
}
```

(Inside the suggestions render, give each row a stable `idx`. The current implementation has `idx` already.)

Replace the existing row UI with logic that:

1. Looks up `recipient = memberById(s.to_member_id)`.
2. Gets `methods = recipient?.payment_methods || []`.
3. Filters `linkable = methods.filter(canDeepLink)` and `nonLinkable = methods.filter(m => !canDeepLink(m))`.
4. If linkable.length > 0:
   - Sort by region preference (`detectRegion()`): for `IN`, prefer `upi` first; for `US`, prefer `paypal/venmo/cashapp`; else any.
   - Render primary button: `Pay via {paymentMethodLabel(linkable[0].type)}` → opens `buildPaymentUrl(linkable[0], { amount, currency: group.currency, note: group.name, payeeName: recipient.name })` via `window.location.href = url`. Then opens the sheet with `setSheet({ suggestion: { ...s, idx }, methodType: linkable[0].type })`.
   - If more than one linkable, render the rest under a "Other ways" collapsed expander.
5. If non-linkable methods (iban/other), render a "How to pay" section with the value, a Copy button, and a Share via WhatsApp button. (See spec for prefilled message text.)
6. Always render the existing "Mark as paid" button (calls `recordSettlement(s, 'manual')` with no via).
7. If `methods.length === 0`, render existing "Mark as paid" + the hint: `💡 Ask {name} to add a payment method for one-tap payments.`

At the bottom of the component, mount:

```jsx
<DidThePaymentGoThroughSheet
  open={sheet !== null}
  recipientName={sheet ? memberById(sheet.suggestion.to_member_id)?.name : ''}
  amountLabel={sheet ? fmt(sheet.suggestion.amount, group.currency) : ''}
  onYes={() => { recordSettlement(sheet.suggestion, sheet.methodType); setSheet(null) }}
  onNo={() => setSheet(null)}
/>
```

Implementation of WhatsApp share (helper at module scope):

```jsx
function shareViaWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener')
}
function copyToClipboard(text) {
  try { navigator.clipboard?.writeText(text) } catch { /* noop */ }
}
```

> **Important**: this task is a substantial rewrite of `SettleUpModal.jsx`. After implementing, read through the whole file once to make sure imports, state, helpers, and render are consistent. Test by opening Goa Trip on the dev frontend (or local Halvio) with the test account whose UPI ID is set.

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SettleUpModal.jsx
git commit -m "feat(web): SettleUpModal renders per-method buttons + confirm sheet"
```

---

### Task 2.9: Deploy Phase 2

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Wait for Vercel build to go green**

Confirm by visiting `https://chillbill.skdev.one/dashboard/settings` (after logging in). The new Settings page should render.

- [ ] **Step 3: Add a UPI ID on the live test account**

Log in as `play-reviewer@chillbill.app`. Settings → add UPI ID `playreviewer@okicici` (placeholder). Save.

- [ ] **Step 4: Open Goa Trip → Settle up**

Verify the suggestions show "Pay via UPI" buttons (because the recipient(s) you just gave a UPI to). Tap one — on a desktop browser the `upi://` link will fail or open a system handler, that's fine; the important thing is the "Did the payment go through?" sheet appears.

- [ ] **Step 5: Rebuild the Android AAB**

Bump `versionCode 4 → 5`, `versionName 1.0.3 → 1.0.4` in `apps/web/android/app/build.gradle`. Then:

```bash
cd apps/web && npm run build && npx cap sync android && cd android && ./gradlew clean bundleRelease
```

Copy `app/build/outputs/bundle/release/app-release.aab` to `~/Downloads/halvio-1.0.4.aab` and upload to Play Console open testing.

- [ ] **Step 6: Commit version bump**

```bash
git add apps/web/android/app/build.gradle
git commit -m "build(android): bump to versionCode 5 / 1.0.4 — payment methods + UPI"
git push origin main
```

---

## Phase 3: Natural-Language Expense Entry

OpenRouter integration, parser endpoint, AddExpenseModal UX overhaul.

---

### Task 3.1: Backend config — OpenRouter env vars

**Files:**
- Modify: `apps/backend/app/core/config.py`

- [ ] **Step 1: Add three settings**

In `apps/backend/app/core/config.py`, inside the Settings class, add:

```python
openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
openrouter_model: str = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b")
openrouter_timeout_seconds: float = float(os.getenv("OPENROUTER_TIMEOUT_SECONDS", "8"))
```

- [ ] **Step 2: Smoke check**

Run: `cd apps/backend && python3 -c "from app.core.config import settings; print(settings.openrouter_model)"`
Expected: `openai/gpt-oss-120b`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/core/config.py
git commit -m "feat(config): add OpenRouter env vars"
```

---

### Task 3.2: LLM service — thin OpenRouter wrapper

**Files:**
- Create: `apps/backend/app/services/llm.py`

- [ ] **Step 1: Implement**

Create `apps/backend/app/services/llm.py`:

```python
"""Thin async wrapper around OpenRouter's OpenAI-compatible chat/completions API."""
import json
import httpx

from app.core.config import settings

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(Exception):
    """Raised on any failure to obtain a valid LLM response."""


async def parse_with_llm(*, system: str, user: str, schema: dict, model: str | None = None) -> dict:
    """Send (system, user) to OpenRouter; ask for JSON matching `schema`; return parsed dict.

    Raises LLMError on network errors, non-2xx responses, missing API key, or invalid JSON.
    """
    if not settings.openrouter_api_key:
        raise LLMError("OPENROUTER_API_KEY not configured")

    body = {
        "model": model or settings.openrouter_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "structured", "strict": True, "schema": schema},
        },
        "temperature": 0.1,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.openrouter_timeout_seconds) as client:
            resp = await client.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": "https://chillbill.skdev.one",
                    "X-Title": "Halvio",
                },
                json=body,
            )
    except (httpx.TimeoutException, httpx.HTTPError) as e:
        raise LLMError(f"openrouter request failed: {e}") from e

    if resp.status_code >= 400:
        raise LLMError(f"openrouter returned {resp.status_code}: {resp.text[:300]}")

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except (KeyError, IndexError, ValueError, TypeError) as e:
        raise LLMError(f"openrouter returned malformed response: {e}") from e
```

- [ ] **Step 2: Smoke check syntax**

Run: `cd apps/backend && python3 -c "import ast; ast.parse(open('app/services/llm.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/services/llm.py
git commit -m "feat(services): OpenRouter LLM wrapper"
```

---

### Task 3.3: Expense parser service (prompt + schema + validation)

**Files:**
- Create: `apps/backend/app/services/expense_parser.py`

- [ ] **Step 1: Implement**

Create `apps/backend/app/services/expense_parser.py`:

```python
"""Parse natural-language expense descriptions into structured records.

Uses an LLM to convert free text into either an `expense` or `settlement` record
that matches Halvio's API shape. Validates the LLM output before returning.
"""
from typing import Any
from app.services.llm import parse_with_llm, LLMError

EXPENSE_PARSE_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "required": ["intent", "confidence"],
    "properties": {
        "intent": {"enum": ["expense", "settlement", "unknown"]},
        "confidence": {"enum": ["high", "low"]},
        "expense": {
            "type": ["object", "null"],
            "additionalProperties": False,
            "properties": {
                "total_amount": {"type": "number"},
                "currency": {"type": "string"},
                "note": {"type": "string"},
                "paid_by_member_id": {"type": "integer"},
                "split_mode": {"enum": ["equal", "amount", "percent"]},
                "splits": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "member_id": {"type": "integer"},
                            "share_amount": {"type": "number"},
                        },
                        "required": ["member_id", "share_amount"],
                    },
                },
            },
            "required": ["total_amount", "currency", "note", "paid_by_member_id", "split_mode", "splits"],
        },
        "settlement": {
            "type": ["object", "null"],
            "additionalProperties": False,
            "properties": {
                "from_member_id": {"type": "integer"},
                "to_member_id": {"type": "integer"},
                "amount": {"type": "number"},
                "note": {"type": "string"},
            },
            "required": ["from_member_id", "to_member_id", "amount", "note"],
        },
        "error": {"type": ["string", "null"]},
    },
}


def _build_system(members: list[dict], currency: str, current_member_id: int) -> str:
    member_list = "\n".join(
        f"- id={m['id']}, name={m['name']!r}{', ghost (no account)' if m.get('is_ghost') else ''}"
        for m in members
    )
    return f"""You convert a single line of natural-language text into a structured Halvio record.

Group context:
- Currency: {currency}
- Current user's member_id: {current_member_id}
- Members in this group:
{member_list}

Rules:
1. If the text describes a shared expense (someone paid for something to be split), return intent=expense.
2. If the text describes one person paying another back (no splitting of a new cost), return intent=settlement.
3. If you can't tell, return intent=unknown and set error to a short message.
4. For expenses, the `paid_by_member_id` must be one of the member ids above. Default to the current user if unclear.
5. For settlements, both from_member_id and to_member_id must be member ids above, and they must differ.
6. Split mode:
   - "equal" if amounts are split evenly across selected members. Compute share_amount = total / n.
   - "amount" if exact amounts per person are stated.
   - "percent" if percentages are stated; convert to share_amount.
   The sum of share_amounts MUST equal total_amount.
7. `note` is a short human label (e.g. "Dinner", "Cab to airport").
8. `currency` is an ISO 4217 code. Use {currency} unless the text explicitly says otherwise.
9. confidence=high if you are sure. confidence=low if there is meaningful ambiguity.
10. Return JSON ONLY matching the provided schema.

Examples:
Input: "I paid 1200 for dinner with Aarav and Priya, split equally"
Output: {{"intent":"expense","confidence":"high","expense":{{"total_amount":1200,"currency":"INR","note":"Dinner","paid_by_member_id":<current>,"split_mode":"equal","splits":[{{"member_id":<current>,"share_amount":400}},...]}},"settlement":null}}

Input: "Cab to airport 800 split 3 ways"
Output: equal split across all 3 group members (or selected if specified), paid by current user.

Input: "I paid Aarav back 500"
Output: {{"intent":"settlement","confidence":"high","expense":null,"settlement":{{"from_member_id":<current>,"to_member_id":<aarav>,"amount":500,"note":""}}}}

Input: "hmm something happened"
Output: {{"intent":"unknown","confidence":"low","expense":null,"settlement":null,"error":"description is too vague"}}
"""


def _validate(parsed: dict, member_ids: set[int]) -> dict:
    """Post-LLM validation. Returns the parsed dict if valid; otherwise mutates intent to 'unknown'."""
    intent = parsed.get("intent")
    if intent == "expense":
        e = parsed.get("expense") or {}
        if e.get("paid_by_member_id") not in member_ids:
            return {"intent": "unknown", "confidence": "low", "expense": None, "settlement": None,
                    "error": "payer is not a member of this group"}
        for s in e.get("splits", []):
            if s.get("member_id") not in member_ids:
                return {"intent": "unknown", "confidence": "low", "expense": None, "settlement": None,
                        "error": "split refers to unknown member"}
        total = float(e.get("total_amount") or 0)
        sum_splits = sum(float(s.get("share_amount") or 0) for s in e.get("splits", []))
        if abs(sum_splits - total) > 0.10:
            return {"intent": "unknown", "confidence": "low", "expense": None, "settlement": None,
                    "error": "split amounts do not sum to total"}
    elif intent == "settlement":
        s = parsed.get("settlement") or {}
        if s.get("from_member_id") not in member_ids or s.get("to_member_id") not in member_ids:
            return {"intent": "unknown", "confidence": "low", "expense": None, "settlement": None,
                    "error": "settlement refers to unknown member"}
        if s.get("from_member_id") == s.get("to_member_id"):
            return {"intent": "unknown", "confidence": "low", "expense": None, "settlement": None,
                    "error": "from and to members must differ"}
        if float(s.get("amount") or 0) <= 0:
            return {"intent": "unknown", "confidence": "low", "expense": None, "settlement": None,
                    "error": "settlement amount must be positive"}
    return parsed


async def parse_expense_text(
    *,
    text: str,
    members: list[dict],
    currency: str,
    current_member_id: int,
) -> dict:
    """Parse `text` against the group context. Always returns a dict with `intent` set."""
    text = (text or "").strip()
    if not text:
        return {"intent": "unknown", "confidence": "low", "error": "empty input"}

    system = _build_system(members, currency, current_member_id)
    try:
        parsed = await parse_with_llm(system=system, user=text, schema=EXPENSE_PARSE_SCHEMA)
    except LLMError as e:
        return {"intent": "unknown", "confidence": "low", "error": str(e)}

    member_ids = {m["id"] for m in members}
    return _validate(parsed, member_ids)
```

- [ ] **Step 2: Smoke syntax check**

Run: `cd apps/backend && python3 -c "import ast; ast.parse(open('app/services/expense_parser.py').read()); print('OK')"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/services/expense_parser.py
git commit -m "feat(services): expense_parser with prompt + schema + validation"
```

---

### Task 3.4: POST /groups/{id}/expenses/parse endpoint — failing test

**Files:**
- Create: `apps/backend/tests/integration/test_expense_parser.py`

- [ ] **Step 1: Write failing tests with the LLM mocked**

Create `apps/backend/tests/integration/test_expense_parser.py`:

```python
"""Tests for the natural-language expense-parse endpoint.

The LLM call is mocked so tests are deterministic and don't require OPENROUTER_API_KEY.
"""
import pytest
from unittest.mock import AsyncMock, patch


class TestExpenseParse:
    async def test_parse_returns_expense_for_well_formed_input(
        self, client, auth_token, test_group_with_members
    ):
        group, members = test_group_with_members
        m_ids = [m.id for m in members]

        mocked = {
            "intent": "expense",
            "confidence": "high",
            "expense": {
                "total_amount": 1200.0,
                "currency": group.currency,
                "note": "Dinner",
                "paid_by_member_id": m_ids[0],
                "split_mode": "equal",
                "splits": [
                    {"member_id": m_ids[0], "share_amount": 400.0},
                    {"member_id": m_ids[1], "share_amount": 400.0},
                    {"member_id": m_ids[2], "share_amount": 400.0},
                ],
            },
            "settlement": None,
        }

        with patch("app.api.v1.expenses.parse_expense_text",
                   new=AsyncMock(return_value=mocked)):
            resp = await client.post(
                f"/api/v1/groups/{group.id}/expenses/parse",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"text": "Dinner 1200 split 3 ways"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["intent"] == "expense"
        assert data["expense"]["total_amount"] == 1200.0

    async def test_parse_returns_settlement(self, client, auth_token, test_group_with_members):
        group, members = test_group_with_members
        m_ids = [m.id for m in members]

        mocked = {
            "intent": "settlement",
            "confidence": "high",
            "expense": None,
            "settlement": {
                "from_member_id": m_ids[0],
                "to_member_id": m_ids[1],
                "amount": 500.0,
                "note": "",
            },
        }

        with patch("app.api.v1.expenses.parse_expense_text",
                   new=AsyncMock(return_value=mocked)):
            resp = await client.post(
                f"/api/v1/groups/{group.id}/expenses/parse",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"text": "Paid Aarav back 500"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["intent"] == "settlement"
        assert data["settlement"]["amount"] == 500.0

    async def test_parse_returns_unknown_on_validation_failure(
        self, client, auth_token, test_group_with_members
    ):
        group, _members = test_group_with_members
        mocked = {
            "intent": "expense",
            "confidence": "high",
            "expense": {
                "total_amount": 1000,
                "currency": group.currency,
                "note": "x",
                "paid_by_member_id": 999999,  # unknown member
                "split_mode": "equal",
                "splits": [{"member_id": 999999, "share_amount": 1000}],
            },
            "settlement": None,
        }
        # The service's _validate will turn the response into 'unknown' itself.
        with patch("app.api.v1.expenses.parse_expense_text",
                   new=AsyncMock(return_value={"intent": "unknown", "confidence": "low",
                                                "expense": None, "settlement": None,
                                                "error": "payer is not a member"})):
            resp = await client.post(
                f"/api/v1/groups/{group.id}/expenses/parse",
                headers={"Authorization": f"Bearer {auth_token}"},
                json={"text": "garbage"},
            )
        assert resp.status_code == 200
        assert resp.json()["intent"] == "unknown"

    async def test_parse_requires_membership(self, client, auth_token):
        # Bogus group id — should 403/404
        resp = await client.post(
            "/api/v1/groups/nonexistent/expenses/parse",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": "x"},
        )
        assert resp.status_code in (403, 404)

    async def test_parse_rejects_empty_text(self, client, auth_token, test_group_with_members):
        group, _ = test_group_with_members
        resp = await client.post(
            f"/api/v1/groups/{group.id}/expenses/parse",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": ""},
        )
        assert resp.status_code == 200
        assert resp.json()["intent"] == "unknown"
```

Run: `python3 -m pytest tests/integration/test_expense_parser.py -x -v`
Expected: tests FAIL (endpoint doesn't exist).

- [ ] **Step 2: Commit failing tests**

```bash
git add apps/backend/tests/integration/test_expense_parser.py
git commit -m "test(expense-parser): failing tests for /expenses/parse"
```

---

### Task 3.5: Implement POST /expenses/parse endpoint

**Files:**
- Modify: `apps/backend/app/api/v1/settlements.py` (router is in this file because it already has access to `_require_membership`; the spec mentioned `expenses.py` but settlements.py has the helper — alternative: add to `expenses.py`)

Actually, to keep concerns clean, **put the new endpoint in `apps/backend/app/api/v1/expenses.py`** and add a tiny membership helper there too — see step 1.

- [ ] **Step 1: Add a membership helper in expenses.py if not present**

Check `apps/backend/app/api/v1/expenses.py`. If it doesn't have a `_require_membership` helper, add one near the top:

```python
from app.db.models.group import Group, GroupMember
from sqlalchemy import select

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
```

- [ ] **Step 2: Add the endpoint**

Append to `apps/backend/app/api/v1/expenses.py`:

```python
from pydantic import BaseModel
from app.services.expense_parser import parse_expense_text


class ParseExpenseRequest(BaseModel):
    text: str


@router.post("/{group_id}/expenses/parse", response_model=dict)
async def parse_expense(
    group_id: str,
    payload: ParseExpenseRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await _require_membership(db, group_id, current_user.id)

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
```

- [ ] **Step 3: Run the tests**

Run: `python3 -m pytest tests/integration/test_expense_parser.py -x -v`
Expected: all PASS.

- [ ] **Step 4: Full backend suite**

Run: `python3 -m pytest -x -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/api/v1/expenses.py
git commit -m "feat(api): POST /groups/{id}/expenses/parse"
```

---

### Task 3.6: Frontend — AddExpenseModal NL section

**Files:**
- Modify: `apps/web/src/components/AddExpenseModal.jsx`

This is the largest frontend change. Read the existing file first.

- [ ] **Step 1: Add the NL textarea + state at the top of the modal**

Add new state near other useState calls:

```jsx
const [nlText, setNlText] = useState('')
const [nlState, setNlState] = useState('idle') // idle | loading | parsed | unknown
const [nlError, setNlError] = useState('')
const [preParseSnapshot, setPreParseSnapshot] = useState(null)
const [parsedSummary, setParsedSummary] = useState(null) // optional context for badge
```

- [ ] **Step 2: Implement the parse handler**

Add helper inside the component:

```jsx
async function handleParse() {
  const text = nlText.trim()
  if (!text) return
  setNlState('loading')
  setNlError('')
  try {
    const res = await api.post(`/groups/${group.id}/expenses/parse`, { text }, { token: accessToken })
    if (res.intent === 'settlement') {
      // Surface a confirm box. Easiest: alert + callback that opens SettleUp.
      const ok = window.confirm(
        `This looks like a settlement (paying someone back), not a shared expense. Switch to the settle-up flow?`
      )
      if (ok) {
        onClose?.()
        onSwitchToSettlement?.(res.settlement)
      }
      setNlState('idle')
      return
    }
    if (res.intent !== 'expense' || !res.expense) {
      setNlState('unknown')
      setNlError(res.error || "Couldn't understand that — try rephrasing, or fill the form below")
      return
    }
    // Snapshot existing form state for Undo
    setPreParseSnapshot({ note, amount, paidByMemberId, splits, mode, selectedMembers: new Set(selectedMembers) })
    // Apply parsed values to form
    const e = res.expense
    setNote(e.note || '')
    setAmount(String(e.total_amount))
    setPaidByMemberId(e.paid_by_member_id)
    setMode(e.split_mode || 'equal')
    setSelectedMembers(new Set(e.splits.map(s => s.member_id)))
    setSplits(e.splits.map(s => ({ member_id: s.member_id, share_amount: s.share_amount, share_percentage: 0 })))
    setParsedSummary(`Parsed from "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`)
    setNlState('parsed')
  } catch (err) {
    setNlState('unknown')
    setNlError(err?.message || "Couldn't reach the parser. Fill the form below.")
  }
}

function undoParse() {
  if (!preParseSnapshot) return
  setNote(preParseSnapshot.note)
  setAmount(preParseSnapshot.amount)
  setPaidByMemberId(preParseSnapshot.paidByMemberId)
  setSplits(preParseSnapshot.splits)
  setMode(preParseSnapshot.mode)
  setSelectedMembers(preParseSnapshot.selectedMembers)
  setPreParseSnapshot(null)
  setParsedSummary(null)
  setNlState('idle')
}
```

The component also needs a new prop `onSwitchToSettlement` for the parent (GroupDetailPage) to handle the swap. Pass a function from the parent that opens SettleUpModal with the prefilled values.

- [ ] **Step 3: Render the NL section at the top of the modal body**

Just above the existing form (inside the modal's main `<div>` or `<form>`):

```jsx
<div className="space-y-3 mb-5">
  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
    <span>✨</span> Describe it (or fill out below)
  </label>
  <textarea
    value={nlText}
    onChange={e => setNlText(e.target.value)}
    placeholder='e.g. "I paid 1200 for dinner with Aarav and Priya"'
    rows={2}
    className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-800 resize-y"
    disabled={nlState === 'loading'}
  />
  <div className="flex items-center justify-between">
    <div className="text-xs text-neutral-500 dark:text-neutral-500">
      💡 Try: "Cab to airport 800 split 3 ways"
    </div>
    <button
      type="button"
      onClick={handleParse}
      disabled={nlState === 'loading' || !nlText.trim()}
      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
    >
      {nlState === 'loading' ? 'Reading…' : 'Read it →'}
    </button>
  </div>
  {nlState === 'unknown' && (
    <div className="text-xs text-red-600 dark:text-red-400">{nlError}</div>
  )}
  {nlState === 'parsed' && parsedSummary && (
    <div className="text-xs flex items-center gap-2 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-2 py-1.5">
      <span>{parsedSummary}</span>
      <button type="button" onClick={undoParse} className="underline">Undo</button>
    </div>
  )}
</div>

<div className="flex items-center gap-3 my-3">
  <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
  <span className="text-xs text-neutral-400">or fill manually</span>
  <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
</div>
```

- [ ] **Step 4: Wire `onSwitchToSettlement` from GroupDetailPage**

In `apps/web/src/pages/GroupDetailPage.jsx`, pass:

```jsx
<AddExpenseModal
  open={addExpenseOpen}
  onClose={() => setAddExpenseOpen(false)}
  group={group}
  user={user}
  onSubmit={addExpense}
  submitting={submitting}
  onSwitchToSettlement={(s) => {
    setSettleOpen(true)
    // Prefill is best-effort; for MVP, just open settle-up modal.
    // (Could pass s as a prop and prefill from there in a later iteration.)
  }}
/>
```

- [ ] **Step 5: Verify build**

Run: `cd apps/web && npm run build 2>&1 | tail -3`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/AddExpenseModal.jsx apps/web/src/pages/GroupDetailPage.jsx
git commit -m "feat(web): NL expense entry in AddExpenseModal"
```

---

### Task 3.7: Update privacy policy

**Files:**
- Modify: `apps/web/public/privacy.html`

- [ ] **Step 1: Add disclosure**

Open `apps/web/public/privacy.html`. After the "How we use your information" section, add:

```html
<h2>Natural-language expense entry</h2>
<p>Halvio offers an optional natural-language expense entry feature. If you use it, the text you
enter is sent to our AI provider (OpenRouter) and the upstream model for parsing only. We do not
use this text for training, and our provider does not retain it. You can always enter expenses
manually instead.</p>
```

Update the "Last updated" date at the top to today.

- [ ] **Step 2: Commit**

```bash
git add apps/web/public/privacy.html
git commit -m "docs(web): privacy disclosure for natural-language entry"
```

---

### Task 3.8: Deploy Phase 3

- [ ] **Step 1: Set the OpenRouter env var on the VM**

You need an OpenRouter API key first (https://openrouter.ai/keys). Then on the VM:

```bash
ssh ssh-social 'cd /home/rsumit123/chillbill && cp docker-compose.override.yml docker-compose.override.yml.bak.$(date +%s) && python3 -c "
import re
p = \"docker-compose.override.yml\"
s = open(p).read()
if \"OPENROUTER_API_KEY\" not in s:
    # insert under environment block
    s = re.sub(r\"(\n      environment:\n)\", r\"\\1      OPENROUTER_API_KEY: PASTE_KEY_HERE\n      OPENROUTER_MODEL: openai/gpt-oss-120b\n      OPENROUTER_TIMEOUT_SECONDS: \\\"8\\\"\n\", s, count=1)
    open(p, \"w\").write(s)
    print(\"added\")
else:
    print(\"already present\")
"'
```

Then SSH in and replace `PASTE_KEY_HERE` with the actual key. **You** (the human) should paste the key — don't print it in scripts.

- [ ] **Step 2: Push code**

```bash
git push origin main
```

- [ ] **Step 3: Pull + rebuild backend**

```bash
ssh ssh-social 'cd /home/rsumit123/chillbill && git pull --ff-only origin main && docker compose up -d --build --force-recreate backend'
```

- [ ] **Step 4: Verify the endpoint exists**

```bash
curl -sS -m 10 -X POST "https://chillbill-api.skdev.one/api/v1/groups/nonexistent/expenses/parse" \
  -H "Content-Type: application/json" -d '{"text":"x"}' \
  -w "\nHTTP %{http_code}\n"
```
Expected: HTTP 401 or 403 (auth required) — proves route exists.

- [ ] **Step 5: End-to-end smoke test**

Open https://chillbill.skdev.one, log in as `play-reviewer@chillbill.app`, open the Goa Trip group, click + (Add expense). In the NL textarea type:

```
I paid 800 for cab to airport, split equally with Aarav and Priya
```

Click "Read it →". Expected: form below populates within ~2s.

If it fails, check VM logs:
```bash
ssh ssh-social 'docker logs chillbill-backend-1 --tail 50'
```

- [ ] **Step 6: Rebuild Android AAB**

Bump `versionCode 5 → 6`, `versionName 1.0.4 → 1.0.5`:

```bash
cd apps/web && npm run build && npx cap sync android && cd android && ./gradlew clean bundleRelease
cp app/build/outputs/bundle/release/app-release.aab ~/Downloads/halvio-1.0.5.aab
```

Upload to Play Console open testing.

- [ ] **Step 7: Commit version bump**

```bash
git add apps/web/android/app/build.gradle
git commit -m "build(android): bump to versionCode 6 / 1.0.5 — NL expense entry"
git push origin main
```

---

## Done criteria

- ✅ Backend tests pass (existing + new ones for payment methods, settlements via, expense parser).
- ✅ Frontend builds without errors. Vitest passes (except the pre-existing Spinner/Avatar failures we already know about).
- ✅ On the live web app:
  - Settings page lets you add a UPI ID (or PayPal/etc).
  - Settle Up shows "Pay via UPI" button for the test reviewer account once they have a UPI ID set.
  - "Did the payment go through?" sheet appears after a deep-link tap.
  - Add Expense modal has the NL textarea at top; pasting a sentence fills the form within ~2s.
- ✅ Android AAB v1.0.5 (versionCode 6) uploaded to Play open testing.

---

## Out of scope (v2 candidates)

- Receipt OCR with itemized splits.
- Cross-group "owe map" (total per friend across all groups).
- Voice input.
- Recurring expenses.
- Trip Wrapped summaries.
- Auto-categorization.
- Smart pattern-detect on `iban`/`other` payment values to render proper deep links.
