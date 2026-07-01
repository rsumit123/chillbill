# Halvio: Recurring Expenses

**Status:** Design approved 2026-07-01
**Author:** Claude + Sumit
**Implements:** Splitwise-style monthly recurring bills (rent, subscriptions, gym) that auto-materialize on their due date without user intervention.

---

## 1. Overview

Rent, Netflix, gym — the "big" recurring monthly bills between flatmates and friends are exactly the moments Halvio should shine. Right now every user has to remember and manually add rent on the 1st of each month. This release adds a **recurring rule** that lets users tick "Repeat monthly" on any expense and have it auto-materialize on the same day-of-month every month, using the same splits, with zero further input.

Scope for v1 is intentionally narrow: **monthly cadence only, fully automatic materialization, in-app management (no push notifications)**. Weekly / biweekly / custom cadences and notification hooks are deferred to v2.

---

## 2. Goals & Non-Goals

### Goals
- Zero-touch monthly bills — user creates the rule once, then never thinks about rent again.
- No new data-model concepts to explain to the user (rules produce normal expenses; they show up in the feed with a 🔁 badge).
- Safe defaults for edge cases (month-length variance, member removal, container downtime).
- Simple, discoverable management (list on Group Detail page + pause/resume).

### Non-Goals (deferred to v2)
- Weekly / biweekly / custom cadences.
- Per-user or per-group timezone (v1 uses a single UTC-anchored cron).
- Backfilling multiple missed months after downtime (v1 materializes ONE catchup expense).
- Push notifications when a rule materializes.
- Cross-group rules (a template that applies to multiple groups).
- Rule history view ("show me all instances of this rule").

---

## 3. Architecture

Splitwise-style. A `recurring_rules` table stores the template. A daily in-process scheduler (APScheduler) materializes due rules into normal `Expense` + `ExpenseSplit` rows. From the user's perspective, materialized expenses look and behave like any other expense (with a small 🔁 badge).

**Why a dedicated table vs a flag on `Expense`:**
- Deleting the seed expense doesn't nuke future runs.
- Editing the rule doesn't retroactively change past materializations.
- Simple mental model: a "recurring bill" is an entity you can list, pause, resume, delete.

**Why APScheduler in-process vs external cron:**
- No infra dependency.
- Startup hook can catch up on missed days from container restarts.
- Halvio's scale (dozens of rules total) is trivial for in-process scheduling.

---

## 4. Data model

### New table: `recurring_rules`

```sql
id                 SERIAL PRIMARY KEY
group_id           UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE
paid_by_member_id  INTEGER NOT NULL REFERENCES group_members(id)
total_amount       NUMERIC(12,2) NOT NULL
currency           VARCHAR(3) NOT NULL
note               TEXT
splits_json        JSONB NOT NULL          -- array of {member_id, share_amount, share_percentage}
day_of_month       SMALLINT NOT NULL       -- 1-31; clamped to month length at run time
next_run_at        DATE NOT NULL           -- the date the NEXT materialization should happen
is_active          BOOLEAN NOT NULL DEFAULT TRUE
paused_reason      TEXT                    -- set when is_active flips off automatically
created_by         UUID NOT NULL REFERENCES users(id)
created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()

INDEX idx_rules_next_run (next_run_at) WHERE is_active
```

`splits_json` is a snapshot of the original splits. If a group member is removed later, the JSON still contains their (now stale) `member_id`; the materialization step detects the mismatch and auto-pauses the rule with `paused_reason`.

### Additions to `expenses` table

```sql
recurring_rule_id  INTEGER NULL REFERENCES recurring_rules(id) ON DELETE SET NULL
```

Non-null on materialized expenses; null on manually-created ones. Powers the 🔁 badge on the expense feed.

---

## 5. Backend

### Endpoints (all under existing `/groups` router)

**`POST /api/v1/groups/{gid}/recurring-rules`**
Create a rule. Request body:
```json
{
  "paid_by_member_id": 24,
  "total_amount": 15000,
  "currency": "INR",
  "note": "Rent",
  "splits": [
    {"member_id": 24, "share_amount": 5000, "share_percentage": null},
    {"member_id": 25, "share_amount": 5000, "share_percentage": null},
    {"member_id": 26, "share_amount": 5000, "share_percentage": null}
  ],
  "day_of_month": 1,
  "start_from_next_month": true
}
```
When `start_from_next_month=true`, `next_run_at` is set to `day_of_month` of the next month (typical case: user just added this month's expense manually and wants the rule to kick in next month). When `false`, `next_run_at = today` (rare; useful for "start this month if we haven't already").

**`GET /api/v1/groups/{gid}/recurring-rules`**
List rules for a group. Membership required.

**`PUT /api/v1/groups/{gid}/recurring-rules/{rid}`**
Edit a rule. Same body shape as create. Changes take effect from the NEXT run; already-materialized past expenses are not touched.

**`POST /api/v1/groups/{gid}/recurring-rules/{rid}/pause`**
Set `is_active=false`. Preserves `next_run_at` so resume is natural.

**`POST /api/v1/groups/{gid}/recurring-rules/{rid}/resume`**
Set `is_active=true`. If `next_run_at` is in the past, fast-forward: `next_run_at = clamp(next_dom_from(today, day_of_month), month_length)`. This avoids surprising the user with a stale catchup instance right after resume.

**`DELETE /api/v1/groups/{gid}/recurring-rules/{rid}`**
Hard delete the rule. Already-materialized expenses stay untouched (their `recurring_rule_id` FK becomes NULL via `ON DELETE SET NULL`).

### Service module: `app/services/recurring_expenses.py`

Exports:
- `async def create_rule_from_payload(db, group_id, payload, current_user) -> dict` — validates membership, creates the row.
- `async def materialize_due_rules(db, today: date) -> int` — the core scheduler function. Returns count of expenses created. See §7.
- `async def next_monthly_date(prev: date, day_of_month: int) -> date` — advances one calendar month, clamps to month length. Pure function, extracted for testability.

### Scheduler module: `app/services/recurring_scheduler.py`

Uses `apscheduler.schedulers.asyncio.AsyncIOScheduler`:

```python
scheduler = AsyncIOScheduler(timezone="UTC")

@app.on_event("startup")
async def _start_scheduler():
    scheduler.add_job(
        _run_materialization,
        CronTrigger(hour=5, minute=0),   # 05:00 UTC ≈ 10:30 IST
        id="materialize_recurring",
        replace_existing=True,
    )
    scheduler.start()
    # Startup catchup — one run right now to cover any missed days.
    await _run_materialization()

async def _run_materialization():
    async with SessionLocal() as db:
        created = await materialize_due_rules(db, today=date.today())
        logger.info("Materialized %d recurring expenses", created)
```

### Requirements

Add `APScheduler>=3.10,<4.0` to `apps/backend/requirements.txt`.

---

## 6. Frontend

### Add Expense flow

`apps/web/src/components/AddExpenseModal.jsx`: add one row below the split editor:

```jsx
<label className="flex items-start gap-2 cursor-pointer">
  <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} />
  <div>
    <div className="text-sm font-medium">Repeat monthly</div>
    <div className="text-xs text-neutral-500">
      Also adds this on the {ordinal(dayOfMonth)} of every month automatically.
    </div>
  </div>
</label>
```

Where `dayOfMonth` is derived from the `date` state (1-31). On save:

```javascript
if (repeat) {
  await Promise.all([
    api.post(`/groups/${groupId}/expenses`, expensePayload, { token }),
    api.post(`/groups/${groupId}/recurring-rules`, {
      ...expensePayload,
      day_of_month: dayOfMonth,
      start_from_next_month: true,
    }, { token }),
  ])
} else {
  await api.post(`/groups/${groupId}/expenses`, expensePayload, { token })
}
```

If either fails, show error toast and keep the modal open. (We don't attempt server-side rollback; the user can retry or manually clean up. In practice both endpoints share the same validation so a partial failure is rare.)

### Group Detail page — new "Recurring bills" section

Between "Expenses" and "Group Balances" on `GroupDetailPage.jsx`. Only rendered when the group has ≥1 rule (skip the empty state).

New component: `apps/web/src/components/RecurringSection.jsx`:

```
┌─ Recurring bills (2) ────────────── ⌄ ──┐
│ 🔁 Rent            ₹15,000  1st of month│
│    Paid by Sumit  Split 3 ways   ⋮      │
│ ⏸  Netflix         ₹200   15th of month │
│    Paused: Member removed        ⋮      │
└─────────────────────────────────────────┘
```

Each row's kebab menu shows: **Edit** / **Pause** or **Resume** / **Delete**.

- Edit opens a modified `AddExpenseModal` (mode="edit-rule") that pre-fills from `splits_json` and PUTs to `/recurring-rules/{id}`.
- Pause/Resume/Delete hit the corresponding endpoint and refetch the rules list.

### Materialized expense marker

In the Expenses list on GroupDetailPage, when `expense.recurring_rule_id != null`, render a small 🔁 badge next to the note. Tapping the expense still opens the standard `EditExpenseModal` — users can adjust individual months (e.g., rent was ₹14,500 this month because of a discount) without affecting the rule.

---

## 7. Materialization algorithm

```python
async def materialize_due_rules(db, today: date) -> int:
    rules = await fetch_active_rules_due(db, today)
    created = 0
    for rule in rules:
        try:
            # 1. Validate all split members are still in the group.
            member_ids = [s["member_id"] for s in rule.splits_json]
            missing = await find_missing_members(db, rule.group_id, member_ids + [rule.paid_by_member_id])
            if missing:
                rule.is_active = False
                rule.paused_reason = f"Member no longer in group (id={missing[0]})"
                continue

            # 2. Create the Expense + ExpenseSplit rows.
            await create_expense_from_rule(db, rule, event_date=today)

            # 3. Advance next_run_at.
            rule.next_run_at = next_monthly_date(rule.next_run_at, rule.day_of_month)
            created += 1
        except Exception as e:
            rule.is_active = False
            rule.paused_reason = f"Materialization error: {e}"
            logger.exception("Failed to materialize rule %s", rule.id)

    await db.commit()
    return created


def next_monthly_date(prev: date, day_of_month: int) -> date:
    # Add one calendar month. Clamp day-of-month to the new month's length.
    y, m = (prev.year, prev.month + 1) if prev.month < 12 else (prev.year + 1, 1)
    dom = min(day_of_month, calendar.monthrange(y, m)[1])
    return date(y, m, dom)
```

**Catchup behavior (missed days from container downtime):** if `next_run_at` is many days in the past, we materialize ONE expense today (not one per missed month). Advancing `next_run_at` uses `next_monthly_date(next_run_at, dom)` — this preserves the intended day-of-month rhythm, but if `next_run_at` is more than a month stale, we advance forward from there, potentially rolling multiple months in a subsequent loop. Simplified rule: **materialize once per rule per cron run**. If a rule was 3 months overdue, the next 2 runs will each materialize one more instance until caught up. This trades completeness for correctness and predictability.

---

## 8. Edge cases (consolidated)

| Case | Behavior |
|---|---|
| `day_of_month=31`, next month is Feb | Clamp to Feb 28/29. `rule.day_of_month` stays 31 so March restores to 31. |
| A split-member is removed from the group | Auto-pause with `paused_reason="Member no longer in group"`. Surfaced in the UI. |
| Container down 3 days, `next_run_at` in the past | Startup + daily jobs both call `materialize_due_rules(today)`. Materialize ONE catchup expense per rule per invocation. |
| Cron runs twice same day | Idempotent — `next_run_at` advances after each materialization, second call finds nothing. |
| Group deleted | Rules cascade-delete. |
| Seed expense deleted | Rule unaffected (separate record). |
| Rule paused, then resumed 6 months later | On resume, fast-forward `next_run_at` to the next `day_of_month` from today. No stale materialization. |
| Timezone | v1 uses a single UTC-anchored cron at 05:00 UTC (≈10:30 IST). Sufficient for the India-heavy user base. v2 will add per-user tz. |
| Amount = 0 or invalid | Rejected at rule creation via same validation as expense endpoint. |

---

## 9. Testing

### Backend
- **Unit** — `next_monthly_date`: covers month-length clamping (dom=31 in Feb, Apr, Jun, Sep, Nov), year rollover (Dec → Jan), leap year Feb.
- **Unit** — `materialize_due_rules` with a mocked `today`:
  - Simple monthly rule materializes.
  - Rule with dom=31 in Feb produces an expense dated Feb 28 (or 29).
  - Removed-member auto-pauses with correct `paused_reason`.
  - Paused rules skipped.
  - Non-due rules (next_run_at > today) skipped.
  - Idempotency: two calls same day → one expense created.
- **Integration** — create rule via `POST /recurring-rules` → advance `today` in a mock → run materialize → assert `Expense` + `ExpenseSplit` rows exist with correct amounts.
- **Integration** — rule lifecycle (create → pause → resume with fast-forward → delete).

### Frontend
- **Vitest** — `AddExpenseModal`: repeat checkbox toggles state; save fires both endpoints on repeat=true and only one on repeat=false; caption reflects `date` day-of-month.
- **Vitest** — `RecurringSection`: renders rule rows, kebab menu triggers correct endpoint, paused rules show reason chip.

---

## 10. Deploy

1. Backend: alembic migration for `recurring_rules` + `expenses.recurring_rule_id`. `pip install -r requirements.txt` on VM (APScheduler). Deploy via existing flow.
2. Frontend: pushes to `main` deploy via Vercel.
3. Bump Android `versionCode` to 13 / `versionName` "1.0.12". Rebuild AAB + debug APK.

No env var changes. No secrets. The APScheduler thread starts in `main.py`'s startup hook — verify in logs after deploy: `Materialized 0 recurring expenses` on first startup.

---

## 11. Out of scope (v2 candidates)

- Weekly / biweekly / custom cadences.
- Per-user / per-group timezone.
- Push notifications on materialization.
- Backfill catchup for multiple missed months at once.
- Cross-group rules.
- Rule history view.
