# Halvio: UPI Settle-Up + Natural-Language Expense Entry

**Status:** Design approved 2026-06-28
**Author:** Claude + Sumit
**Implements:** Two differentiator features for the open-testing Halvio app.

---

## 1. Overview

Halvio's core flow (groups → expenses → balances → settle up) is shipped and
working. To stand out from Splitwise/Tricount/Splid, this release adds two
high-impact features:

1. **Geo-aware payment methods + UPI settle-up** — replace the manual
   "Mark as paid" step with a one-tap deep link into the recipient's payment
   app (UPI for India, PayPal/Venmo/Cash App for others). India-first, but
   gracefully covers all regions.
2. **Natural-language expense entry** — paste or type a description
   (*"I paid 1200 for dinner with Aarav and Priya"*) and Halvio fills the
   expense form via an LLM. Includes settlement-vs-expense intent detection.

Out of scope for this release (deferred to v2): receipt OCR, cross-group "owe
map", voice input, recurring expenses, "Trip Wrapped" summaries.

---

## 2. Goals & Non-Goals

### Goals
- One-tap payment from the settle-up flow for at least 90% of users worldwide
  (UPI covers India; PayPal/Venmo/Cash App cover the bulk of US/EU).
- Expense entry in <5 seconds for the common "I paid X for Y, split with Z"
  shape.
- Zero new SDK dependencies on the backend (use `httpx` + OpenRouter HTTP).
- No regression for users who don't set a payment method or don't use the NL
  entry — both are additive.

### Non-Goals
- Verifying that UPI payments actually went through (would require becoming a
  registered PSP — out of scope). We rely on the user confirming.
- Building first-class integrations for every payment provider (PayPal /
  Venmo / Cash App deep links are enough for MVP; everything else is "copy +
  share").
- Voice input (separate small follow-up).
- Auto-categorization of expenses, recurring expenses, OCR, cross-group views.

---

## 3. Feature 1: Geo-aware payment methods + UPI settle-up

### 3.1 Data model

Add one JSON column to `users`:

```python
# app/db/models/user.py
class User(Base):
    ...
    payment_methods: Mapped[list[dict]] = mapped_column(
        JSON, nullable=False, default=list, server_default="[]"
    )
```

Each entry is `{ "type": "upi" | "paypal" | "venmo" | "cashapp" | "iban" | "other", "value": "<handle>" }`.

A user may have zero, one, or many entries. We don't restrict ordering — the
first entry of the preferred type is "primary" for that type.

Add one nullable column to `settlements` for telemetry:

```python
class Settlement(Base):
    ...
    via_payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # values: 'upi', 'paypal', 'venmo', 'cashapp', 'iban', 'other', 'manual'
```

`'manual'` for today's "Mark as paid" flow. The other values record which deep
link the user actually used. Pure analytics; doesn't affect balances.

### 3.2 Backend endpoints

**`PUT /api/v1/me/payment-methods`** — replace the user's full list.

Request:
```json
{ "payment_methods": [ {"type": "upi", "value": "aarav@okicici"}, ... ] }
```

Validates:
- `type` ∈ allowed enum
- `value` is non-empty string ≤ 200 chars
- For `type=upi`: regex `^[\w.\-]+@[\w.\-]+$`
- For `type=paypal`: starts with `paypal.me/` OR is a bare username
- For `type=venmo`: starts with `@` or is a bare username
- For `type=cashapp`: starts with `$` or is a bare username

Returns the updated list. Replaces all previous entries (simpler than
add/edit/delete endpoints for the small UI surface area).

**Existing `POST /api/v1/groups/{id}/settlements`** — add optional
`via_payment_method` field to record telemetry. Default `null` (treated as
manual).

**Existing `GET /api/v1/groups/{id}`** — include each member's
`payment_methods` in the response, so the frontend can render the right buttons
without an extra round trip.

> Privacy: a member's payment methods are visible only to other members of
> shared groups. We don't expose them via any public endpoint.

### 3.3 Frontend: geo detection helper

Tiny utility (`src/services/geo.js`), no backend call:

```js
export function detectRegion() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""
  const lang = (navigator.language || "en-US")
  if (tz === "Asia/Kolkata" || lang.endsWith("-IN")) return "IN"
  if (lang.endsWith("-US") || tz.startsWith("America/")) return "US"
  if (lang.endsWith("-GB") || lang.endsWith("-IE") || tz.startsWith("Europe/")) return "EU"
  return "OTHER"
}

export const SUGGESTED_METHODS = {
  IN:    [{ type: "upi",    label: "UPI ID",       placeholder: "you@okicici" }],
  US:    [{ type: "paypal", label: "PayPal",       placeholder: "paypal.me/yourname" },
          { type: "venmo",  label: "Venmo",        placeholder: "@your-handle" },
          { type: "cashapp",label: "Cash App",     placeholder: "$yourname" }],
  EU:    [{ type: "paypal", label: "PayPal",       placeholder: "paypal.me/yourname" },
          { type: "iban",   label: "IBAN",         placeholder: "GB29 NWBK 6016 ..." }],
  OTHER: [{ type: "other",  label: "Payment info", placeholder: "PayPal, bank tag, etc." }],
}
```

Edge cases (VPN users, expats, travelers) are handled by a small *"Different
country? See more options"* link on the setup screen that reveals all method
types regardless of geo.

### 3.4 Frontend: new screens / changes

**(a) Profile / settings screen** (new — we don't currently have one):
A simple page reachable from the user menu, with:
- Name + email (read-only for MVP)
- Payment methods section — one row per saved method, each editable. "Add"
  button shows the geo-suggested type first, with a small "Other types" link
  to expand.
- Save button → `PUT /me/payment-methods`.

**(b) First-run nudge** in the Layout/dashboard header:
If `user.payment_methods` is empty and the user is in a group with at least
one expense, show a one-time dismissible banner: *"Add your UPI ID so friends
can pay you in one tap →"* linking to the settings screen. Stored
dismissal state in localStorage (`cb_payment_nudge_dismissed`).

**(c) SettleUpModal** (extend existing component):
For each suggested transfer row, look up the recipient's `payment_methods`.

- If the recipient has at least one method with a known deep link
  (`upi`/`paypal`/`venmo`/`cashapp`):
  - Show a primary **"Pay via {label}"** button that triggers the deep link.
  - If multiple methods, sort by payer's `detectRegion()` preference; show
    the top one as primary, the rest under a collapsed "Other ways" expander.
- If the only methods are `iban`/`other`:
  - Show a **"How to pay"** panel: the value, a **Copy** button, and a
    **Share via WhatsApp** button with a pre-filled message
    (*"Settling {group} — sending you {amount} via {method}, let me know
    once received 👍"*).
- "Mark as paid" remains as the catch-all secondary button on every row.
- If recipient has no payment methods at all, show today's UI plus a small
  hint: *"💡 Ask {name} to add a payment method for one-tap payments."*

### 3.5 Deep-link reference

| type | URL scheme | Example |
|---|---|---|
| `upi` | `upi://pay?pa=<vpa>&pn=<name>&am=<amt>&cu=INR&tn=<note>` | Android picker, all UPI apps |
| `paypal` | `https://paypal.me/<user>/<amt>` | Opens app or web |
| `venmo` | `venmo://paycharge?txn=pay&recipients=<user>&amount=<amt>&note=<note>` | Web fallback: `https://account.venmo.com/u/<user>` |
| `cashapp` | `https://cash.app/$<user>/<amt>` | Opens app or web |

Construction: `src/services/payments.js` exports `buildPaymentUrl(method, amount, note)`.

### 3.6 The "did the payment go through?" sheet

After tapping a payment deep link, the modal stays open with a sheet:

```
Did the payment to Aarav go through?
[ Cancel ]   [ Yes, mark as paid ]
```

- **Yes** → posts the settlement (`via_payment_method: 'upi'` etc.) and removes
  the row.
- **Cancel** → does nothing. User can retry or manually mark later.

We can't auto-confirm without false positives (user might cancel mid-payment),
so the explicit confirmation is the honest UX.

### 3.7 Edge cases
- **Multi-currency**: UPI is INR-only. If group currency ≠ INR, hide the UPI
  button even if the recipient has a UPI ID set; show the next-best method.
  PayPal supports any currency (we pass `cu` param). Cash App is USD-only.
- **iOS users**: `upi://` works on iOS too (most UPI apps register the scheme),
  but Venmo/Cash App deep links are Android+iOS native. PayPal links are
  cross-platform. No special-casing needed at MVP.
- **Empty/invalid handle**: validation on save rejects, but if a malformed
  handle slips through, render it as `iban`/`other` (copy + share). Never
  ship a broken deep link.

---

## 4. Feature 2: Natural-language expense entry

### 4.1 Data flow

```
User types text in AddExpenseModal textarea
      ↓
Frontend POST /api/v1/groups/{id}/expenses/parse  { text }
      ↓
Backend builds context (members, currency, current user's member_id)
      ↓
Backend calls OpenRouter chat/completions with system prompt + text
      ↓
OpenRouter returns JSON-schema-validated response
      ↓
Backend returns structured result to frontend
      ↓
Frontend fills the form fields, user reviews + clicks Add
      ↓
Normal POST /expenses (or /settlements if intent=settlement)
```

### 4.2 Backend endpoint

**`POST /api/v1/groups/{group_id}/expenses/parse`**

Request:
```json
{ "text": "I paid 1200 for dinner with Aarav and Priya, split equally" }
```

Response (success):
```json
{
  "intent": "expense",
  "confidence": "high",
  "expense": {
    "total_amount": 1200,
    "currency": "INR",
    "note": "Dinner",
    "paid_by_member_id": 20,
    "split_mode": "equal",
    "splits": [
      {"member_id": 20, "share_amount": 400},
      {"member_id": 21, "share_amount": 400},
      {"member_id": 22, "share_amount": 400}
    ]
  }
}
```

Response (settlement):
```json
{
  "intent": "settlement",
  "confidence": "high",
  "settlement": {
    "from_member_id": 20,
    "to_member_id": 21,
    "amount": 500,
    "note": "Cab to airport"
  }
}
```

Response (unparseable):
```json
{
  "intent": "unknown",
  "error": "couldn't determine intent",
  "raw_text": "..."
}
```

HTTP 200 in all cases (the frontend interprets `intent`). HTTP 4xx only for
auth/group-membership/rate-limit errors.

### 4.3 LLM integration

**Provider:** OpenRouter HTTP API (no SDK).
**Default model:** `openai/gpt-oss-120b` (env-overridable).
**Endpoint:** `https://openrouter.ai/api/v1/chat/completions`.

New env vars (added to backend `docker-compose.override.yml` on VM):
- `OPENROUTER_API_KEY` (required)
- `OPENROUTER_MODEL` (default `openai/gpt-oss-120b`)
- `OPENROUTER_TIMEOUT_SECONDS` (default `8`)

New service module `app/services/llm.py`:

```python
import httpx, json
from app.core.config import settings

OR_URL = "https://openrouter.ai/api/v1/chat/completions"

async def parse_with_llm(system: str, user: str, schema: dict) -> dict:
    async with httpx.AsyncClient(timeout=settings.openrouter_timeout_seconds) as client:
        resp = await client.post(
            OR_URL,
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "HTTP-Referer": "https://chillbill.skdev.one",  # OpenRouter attribution
                "X-Title": "Halvio",
            },
            json={
                "model": settings.openrouter_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "expense_parse",
                        "strict": True,
                        "schema": schema,
                    },
                },
                "temperature": 0.1,
            },
        )
    resp.raise_for_status()
    body = resp.json()
    content = body["choices"][0]["message"]["content"]
    return json.loads(content)
```

New service `app/services/expense_parser.py` builds the prompt + schema and
calls `parse_with_llm`. Includes ~8 few-shot examples covering: equal split,
percentage split, exact amounts, partial group ("split with Aarav only"),
ghost members, settlement language ("paid back", "owe", "sent"), and
ambiguous cases.

**JSON schema** (simplified):
```json
{
  "type": "object",
  "required": ["intent", "confidence"],
  "properties": {
    "intent": { "enum": ["expense", "settlement", "unknown"] },
    "confidence": { "enum": ["high", "low"] },
    "expense": { /* total_amount, currency, note, paid_by_member_id, split_mode, splits */ },
    "settlement": { /* from_member_id, to_member_id, amount, note */ },
    "error": { "type": "string" }
  }
}
```

**Validation after LLM response:**
- `member_id`s referenced must all belong to this group (else clamp to
  `unknown`).
- For expenses: `sum(splits.share_amount)` must equal `total_amount` ±₹0.10.
- For settlements: `from_member_id != to_member_id`, both members exist.

If validation fails, return `intent: "unknown"` + an `error` field. Frontend
shows the generic "couldn't understand" message.

### 4.4 Frontend changes to AddExpenseModal

Layout becomes (top to bottom):

```
┌── Add expense to "Goa Trip" ────────────────────┐
│  ✨ Describe it (or fill out below)             │
│  ┌─────────────────────────────────────────┐    │
│  │ <textarea, autofocus>                   │    │
│  └─────────────────────────────────────────┘    │
│                              [ Read it → ]      │
│  💡 Try: "Cab to airport 800 split 3 ways"      │
│                                                 │
│  ─────────────── or ───────────────             │
│                                                 │
│  <existing form fields unchanged>               │
│                                                 │
│  [Cancel]                    [Add expense]      │
└─────────────────────────────────────────────────┘
```

State machine for the NL section:
- `idle` → user typing
- `loading` → button shows spinner, textarea dims, ~500–2000ms
- `parsed` → form fields populated; small chip *"Parsed from your description · Undo"* above form
- `unknown` → red banner under textarea: *"Couldn't understand that — try rephrasing, or fill out below"*; form remains empty
- `settlement_detected` → modal swap: an alert box appears *"Looks like a settlement — record a payment to Aarav for ₹500 instead?"* with [Cancel] / [Yes, record payment]. Yes → close AddExpense, open SettleUp pre-filled.

**Undo:** clicking the Undo chip clears the form back to its pre-parse state.
Implementation: snapshot form state before applying parse; restore on undo.

**No tabs / no toggle / no "smart mode" switch.** Both paths are visible in
one modal. Discoverability is automatic.

### 4.5 Cost / latency

- gpt-oss-120b on OpenRouter: ~$0.04/M input + $0.10/M output.
- Typical parse: ~500 input tokens + ~150 output tokens → ~$0.0001/call.
- At 10k parses/day → $1/day. Negligible.
- Latency: 500–1500ms typical via Groq/Cerebras backends. Under our 8s
  timeout.

### 4.6 Privacy

Update `apps/web/public/privacy.html` to add:

> *We offer an optional natural-language expense entry feature. If you use it,
> the text you enter is sent to our AI provider (OpenRouter) and the
> upstream model for parsing only. We do not use this text for training, and
> our provider does not retain it. You can always enter expenses manually
> instead.*

### 4.7 Edge cases
- **Empty text** → button disabled.
- **Single-member group** → still works, just creates an expense paid by that
  member with no splits.
- **Multi-currency** → LLM picks up the currency from the text ("$50 dinner")
  if it differs from group default. We validate it's a known ISO code; if it
  conflicts with the group currency, we set `confidence: "low"` and the
  frontend shows a warning chip on the form.
- **Hindi/Hinglish text** → gpt-oss-120b handles code-switching well; same
  prompt works ("Yaar bara sau dinner paid kara").
- **Backend can't reach OpenRouter** → 503 response, frontend shows
  *"Couldn't reach our AI right now — please fill out the form below."*
- **Rate limit (from OpenRouter)** → 429 → frontend shows *"Too many requests,
  try again in a minute"*. Per-user rate limit on backend: 30 parses/hour.

---

## 5. Testing

### Backend
- Unit: `expense_parser` with mocked LLM returning canned JSON, exercises
  validation paths (sum mismatch, unknown member_id, settlement intent).
- Integration: `test_payment_methods.py` — `PUT /me/payment-methods` happy
  path + invalid types/values.
- Integration: `test_settlements.py` extended — `via_payment_method` field
  round-trips correctly.

### Frontend
- Manual smoke tests on a real device (UPI flow can only be tested with an
  actual UPI app installed).
- Vitest: `geo.js` detection logic for IN/US/EU/OTHER inputs.
- Vitest: `payments.js` URL builders for each provider.

### LLM prompt
- Maintain `apps/backend/tests/llm_fixtures/expense_parse_cases.json` —
  hand-curated text → expected parse pairs (~20 cases including all split
  modes, settlement intent, Hinglish). Run as a manual eval script, not in
  CI (would burn OpenRouter credits on every push).

---

## 6. Deploy order

To minimize blast radius, ship in three steps:

1. **Silent foundation** (no user-visible change):
   - Migration: add `users.payment_methods` JSON column + `settlements.via_payment_method` column.
   - Backend: `PUT /me/payment-methods` endpoint; expose `payment_methods` on group member listings; accept `via_payment_method` on settlement create.
   - Frontend: `geo.js` + `payments.js` utilities, no UI yet.
   - Verify: tests pass, no UI affected.
2. **Payment methods + UPI/PayPal/etc. settle-up**:
   - Profile/settings screen, first-run nudge.
   - Update SettleUpModal with per-method buttons + "Did the payment go through?" sheet.
   - Deploy + manual UPI test on real device.
3. **Natural-language entry**:
   - Backend: `expense_parser` service, `POST /expenses/parse` endpoint, OpenRouter env vars.
   - Frontend: AddExpenseModal extended with NL textarea + parse-then-fill UX.
   - Deploy + test with a variety of prompts.

Each step is its own PR / commit batch.

---

## 7. Open questions (none blocking)
- Do we want a "Pay all" button that fires one UPI link per outstanding row in
  sequence? **Deferred to v2** — single-row pay covers 95% of cases and the
  multi-row "did it go through?" prompt sequence would be ugly.
- Should we expose `payment_methods` history (edit log)? **No, not for MVP** —
  current value only.

---

## 8. Out of scope (v2 candidates)
- Receipt OCR with itemized splits.
- Cross-group "owe map" (total owed to a person across all groups).
- Voice input via Capacitor Speech plugin.
- Recurring expenses.
- "Trip Wrapped" end-of-trip summary.
- Auto-categorization of expenses.
- Smart pattern-match on `iban`/`other` field to render proper deep links
  (e.g. `paypal.me/...` → PayPal button).
