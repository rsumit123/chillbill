# Halvio: Cross-Group Owe Map (People view)

**Status:** Design approved 2026-06-29
**Author:** Claude + Sumit
**Implements:** Read-only aggregation of per-person balances across all the current user's groups, surfaced as a new top-level **People** tab.

---

## 1. Overview

Today, every group is an island. To know whether Aarav owes you money, you have to open each group separately and add the balances in your head. Splitwise has a "Friends" view for this; we don't.

This release adds a new **People** tab at `/dashboard/people` that aggregates balances per registered user across all groups you're in. Tapping a person expands to show the per-group contributions; tapping a group row jumps to that group's existing detail page (where the existing Settle Up flow already handles single-group settling).

This is intentionally **read-only**. A cross-group "Settle all" button is meaningful UX but adds significant complexity (bidirectional / multi-currency / atomic batch endpoint) — deferred to a follow-up.

---

## 2. Goals & Non-Goals

### Goals
- One screen that answers "who owes me money and who do I owe?" across the entire app.
- Honest currency handling — never collapse different currencies into one number.
- Read-only with one obvious next action per row (jump to the contributing group).
- Add ~zero perceived latency on a typical user (≤10 groups).

### Non-Goals (deferred)
- Cross-group "Settle all" batch action.
- Currency conversion to a single preferred currency.
- "Create new group with this person" shortcut.
- Cross-group expense history per person.
- Friend/contact list independent of groups.

---

## 3. Identity model

The biggest open question for this feature is "who counts as the same person across groups?". Our answer:

- **Registered users**: aggregated by `users.id`. The same registered user in 5 groups is one row.
- **Ghost members**: excluded from this view entirely. Two ghost "Aarav"s in different groups have no link in our data model — aggregating would be misleading. The breakdown for a registered user can still include the same registered user across registered+ghost groups, but ghost-only people don't appear.
- **Yourself**: excluded (you don't owe yourself).

This is honest with the data model and avoids fake "friend graph" inference. If users want to "promote" a ghost member to a real user, that's the existing "send invite" flow on the group page — out of scope here.

---

## 4. Backend

### 4.1 New endpoint

**`GET /api/v1/me/balances/people`**

Auth required. Returns aggregated cross-group balances for the current user.

Response shape:

```json
{
  "people": [
    {
      "user_id": "e0f0...",
      "name": "Aarav",
      "avatar_url": null,
      "balances": {
        "INR": 800.0,
        "USD": -20.0
      },
      "groups": [
        {
          "group_id": "62cb...",
          "group_name": "Goa Trip",
          "currency": "INR",
          "balance": 600.0
        },
        {
          "group_id": "ab12...",
          "group_name": "Flatmate Rent",
          "currency": "INR",
          "balance": 200.0
        },
        {
          "group_id": "cd34...",
          "group_name": "NYC Trip",
          "currency": "USD",
          "balance": -20.0
        }
      ]
    }
  ]
}
```

Conventions:
- `balances[currency]` is **net** within that currency (`+` = they owe you, `-` = you owe them).
- `groups` is the unaggregated per-group list (each line corresponds to one group + currency pair where the balance is non-zero between this user and the current user).
- `people` is sorted by `sum(abs(balances.values()))` descending.
- A person is **only included** if at least one currency in `balances` is non-zero (within `0.01` tolerance).
- A group is **only included in `groups`** if its balance is non-zero (within `0.01` tolerance).

### 4.2 Service module

New file: `apps/backend/app/services/people_balances.py`

```python
async def compute_people_balances(
    db: AsyncSession,
    current_user_id: str,
) -> list[dict]:
    ...
```

Algorithm:

1. Query all `GroupMember` rows for `current_user_id` → get the set of `group_id`s the user belongs to.
2. For each such group:
   - Fetch the `Group` row (for `name` and `currency`).
   - Call existing `compute_group_balances(db, group_id)` to get `{member_id: float}`.
   - Fetch the `GroupMember` rows for this group (we need `user_id`, `name`, `is_ghost`).
3. For each (group, member, balance) tuple:
   - Skip if `member.user_id is None` (ghost).
   - Skip if `member.user_id == current_user_id` (yourself).
   - Skip if `abs(balance) < 0.01`.
   - **Flip the sign**: the existing `compute_group_balances` returns each member's own balance (positive = they are owed). For OUR view (this user's perspective), if the *other* member's balance is +600, that means **they** are owed — which means **the current user owes them**. So in our output, this row's balance should be **−600** (you owe them). And conversely if the other member's balance is −400, they owe the group; in our view, that means they owe **us**, so we report **+400**.
   - Append a per-group contribution: `(user_id, group_id, group_name, currency, signed_balance_from_my_pov)`.
4. Bucket contributions by `user_id`:
   - For each user, load their `User` row for `name` and `avatar_url`.
   - Compute `balances` = sum of signed contributions per currency.
   - Build `groups` = list of per-group lines.
   - Skip the user if all currency totals net within tolerance.
5. Sort the final list of people by `sum(abs(balances.values()))` descending.

### 4.3 API endpoint

Add to `apps/backend/app/api/v1/users.py`:

```python
@router.get("/me/balances/people", response_model=dict)
async def my_people_balances(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    people = await compute_people_balances(db, current_user.id)
    return {"people": people}
```

(Add to `users.py` rather than a new router file — it's a "me" endpoint conceptually next to `/me` and `/me/payment-methods`.)

### 4.4 Tests

`apps/backend/tests/integration/test_people_balances.py`:

- **empty**: user with no groups → `{"people": []}`.
- **solo group**: user is the only member of a group → no people surfaced.
- **ghost-only group**: user + 2 ghost members → no people surfaced.
- **single group, owed by one registered user**: expected sign + amount.
- **single group, owing one registered user**: expected sign + amount (negative balance).
- **multi-group same currency**: same registered user in 2 groups, both INR, balances net correctly; breakdown lists both.
- **multi-group multi-currency**: same user across INR and USD; both currencies appear in balances; breakdown lists both.
- **same-currency cancels**: user owes you ₹600 in group A and you owe them ₹600 in group B → person excluded if all currencies net to 0.
- **sorting**: 3 people with different totals; verify descending order.

---

## 5. Frontend

### 5.1 New page

`apps/web/src/pages/PeoplePage.jsx`

```jsx
export default function PeoplePage() {
  const { accessToken } = useAuth()
  const [people, setPeople] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/me/balances/people', { token: accessToken })
      .then(r => setPeople(r.people || []))
      .catch(e => setError(e.message || 'Failed to load'))
  }, [accessToken])

  // ... render
}
```

States rendered:
- `people === null` → loading spinner (matches `GroupDetailPage` loading style).
- `error` → red banner "Couldn't load balances" + Retry button.
- `people.length === 0` → empty state: "🎉 All settled up. When friends owe you or vice versa, they'll show up here."
- otherwise → list of `<PersonRow>` components, each expandable.

### 5.2 PersonRow component

`apps/web/src/components/PersonRow.jsx` (extracted for testability)

Props: `person` (one entry from the API), `onJumpToGroup(group_id)`.

Collapsed:
```
┌──────────────────────────────────────────────────┐
│ [AR]  Aarav                                  ⌄   │
│       owes you  ₹800                             │
│       you owe   $20                              │
└──────────────────────────────────────────────────┘
```

Expanded (state held locally per row):
```
┌──────────────────────────────────────────────────┐
│ [AR]  Aarav                                  ⌃   │
│       owes you  ₹800                             │
│       you owe   $20                              │
│  ──────────────────────────────────────────────  │
│  Goa Trip       (INR)   owes you  ₹600    →     │
│  Flatmate Rent  (INR)   owes you  ₹200    →     │
│  NYC Trip       (USD)   you owe   $20     →     │
└──────────────────────────────────────────────────┘
```

Color coding (matches existing balance UI conventions in `GroupDetailPage`):
- Positive (`owes you`): green text
- Negative (`you owe`): red text
- Zero: not rendered

Currency formatting uses `Intl.NumberFormat` exactly like the existing `currency()` helper in `GroupDetailPage`.

### 5.3 Routing

In `apps/web/src/App.jsx`, add inside the `/dashboard` route children:

```jsx
<Route path="people" element={<PeoplePage />} />
```

### 5.4 Navigation

In `apps/web/src/components/Layout.jsx`:

- **Desktop nav**: add a "People" `NavLink` next to the existing "Groups" link (same pattern, different icon — use a people/friends SVG).
- **Mobile dropdown menu**: add "People" NavLink above "Settings" in the user dropdown.

### 5.5 Per-group jump

In `PersonRow`, the right-arrow on each per-group line uses `useNavigate()` to push `/dashboard/groups/${group_id}`. That page already shows the group balances and Settle Up — no new flow needed.

### 5.6 Tests

`apps/web/src/tests/pages/PeoplePage.test.jsx`:

- Renders loading state initially.
- Renders empty state when `people: []`.
- Renders person rows when API returns data.
- Expanding a row reveals the per-group breakdown.
- Tapping a group line calls navigate with the correct path.

(API is mocked with `vi.mock('../../services/api.js', ...)`.)

---

## 6. Edge cases (consolidated)

| Case | Behavior |
|---|---|
| Person has balance 0 in all groups | Excluded |
| Solo group (only you) | Group contributes nothing |
| Ghost-only group (you + ghosts) | Group contributes nothing to People view |
| Same person, same currency, multiple groups | Net within currency; breakdown shows each group |
| Same-currency balances cancel out across groups (net 0) | That currency hidden from totals; person excluded if all currencies net 0 |
| `abs(balance) < 0.01` | Treated as zero |
| Group user used to be in but was removed from | Excluded (only current memberships are queried) |
| Ghost member with no name | Not applicable (ghosts excluded) |
| Registered user with no avatar | Falls back to initials via existing `<Avatar />` |
| 3+ currencies per person | Each currency on its own line in the row + each in `balances` |

---

## 7. Performance & scaling

- ~10 groups (current scale): single API call, sub-100ms total.
- 100 groups: still fine — the per-group balance computation is one query per group. If needed later, we can parallelize with `asyncio.gather` or add a denormalized cache. **Not doing now (YAGNI).**
- Frontend renders client-side — no pagination needed at this scale.

---

## 8. Deploy

Single deploy:
1. Backend: schema unchanged → no migration. Deploy backend code via existing VM flow (`git pull` + `docker compose up -d --build --force-recreate backend`).
2. Frontend: deployed via Vercel on push to `main`.
3. Bump Android `versionCode` to 10 / `versionName` 1.0.9. Rebuild AAB + debug APK.

No env var changes, no infra changes, no secrets to rotate. Lower-risk than the previous releases.

---

## 9. Out of scope (v2 candidates after this ships)

- **Cross-group "Settle all" with a person** (`POST /me/settlements/batch`). The data model already supports it; UX for bidirectional/multi-currency needs more thought.
- **Optional currency conversion** to a single display currency for the totals (the breakdown would always remain in native currencies).
- **"Create new group with this person" shortcut.**
- **History view per person**: every expense and settlement involving them across groups.
- **People-tab pagination/search** when users have hundreds of contacts.
