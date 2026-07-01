# ChillBill

Splitwise-style expense sharing web app with FastAPI backend and React frontend.

## Stack

- **Backend**: FastAPI + SQLAlchemy (async) + Alembic + SQLite (dev)
- **Frontend**: React 18 + Vite + TailwindCSS
- **Auth**: Email/password (JWT access/refresh), Argon2 hashing
- **Testing**: pytest (backend) + Vitest + React Testing Library (frontend)
- **Deployment**: Docker + Docker Compose

## Features

- ✅ User authentication (signup, login, JWT tokens)
- ✅ Create groups with custom icons and currencies
- ✅ Add members (registered users or "ghost" offline members)
- ✅ Create expenses with flexible splitting (equal, by amount, by percentage)
- ✅ Select specific members for each expense
- ✅ Real-time balance calculations
- ✅ Multi-currency support with live exchange rates
- ✅ Dark mode
- ✅ Mobile-friendly responsive design
- ✅ Native Android app via Capacitor (with native Google Sign-In) — see [apps/web/CAPACITOR_ANDROID.md](./apps/web/CAPACITOR_ANDROID.md)
- ✅ Comprehensive test coverage

## Quick Start

### Using Docker (Recommended)

```bash
# Start both backend and frontend
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

- Backend: http://localhost:8000
- Frontend: http://localhost:5173
- API Docs: http://localhost:8000/docs

### Local Development

**Backend:**
```bash
cd apps/backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd apps/web
npm install
npm run dev
```

## Testing

See [TESTING.md](./TESTING.md) for comprehensive testing guide.

**Quick test commands:**

```bash
# Backend tests
cd apps/backend
pip install -r requirements-dev.txt
pytest

# Frontend tests
cd apps/web
npm test
```

## Recurring expense scheduler (operational note)

Halvio's monthly recurring expenses are materialized by an **APScheduler AsyncIOScheduler running inside the FastAPI process** — NOT a system cron on the VM. Wiring lives in `apps/backend/app/services/recurring_scheduler.py` and is started from `apps/backend/app/main.py`'s `@app.on_event("startup")` hook.

### What runs when
- **On every container start**: `run_startup_catchup()` — one-shot call to `materialize_due_rules(today)` that catches up any rules whose `next_run_at <= today`.
- **Daily at 05:00 UTC** (≈10:30 IST): the same materialize call, driven by APScheduler's cron trigger.

The daily run is idempotent — a rule's `next_run_at` advances after each materialization, so the second call finds nothing.

### Redeploying / migrating the backend

If the backend moves to a new host, **as long as the FastAPI app starts** the scheduler starts with it — no external cron setup needed. Concretely:

- ✅ **Single container on a VM** (current setup): zero extra config.
- ✅ **Systemd-managed FastAPI**: zero extra config.
- ⚠️ **Auto-scaled or multi-instance deployment** (Cloud Run min-instances > 1, Kubernetes with N replicas, etc.): APScheduler will fire in every replica, causing **duplicate materializations**. Fix: either pin the app to a single instance for the scheduler role, or replace APScheduler with an external scheduler (GCP Cloud Scheduler → an internal HTTP endpoint like `POST /internal/materialize-recurring`, or a leader-election pattern).
- ⚠️ **Serverless / cold-start functions**: the scheduler dies with each cold shutdown. Would need an external trigger (Cloud Scheduler + a signed HTTP endpoint).

### VM downtime behavior (spot VMs)

- Container down for hours to a day: fully recovered on restart via startup catchup.
- Container down for multiple months on a rule: v1 materializes ONE catchup expense per rule per restart. Subsequent restarts each pick up one more. This is a known v1 gap (see `docs/superpowers/specs/2026-07-01-recurring-expenses-design.md` §11) — intentional trade of completeness for correctness.

### Quick verification after deploy

```bash
# Confirm the scheduler booted (no startup errors)
docker logs chillbill-backend-1 2>&1 | grep -Ei "recurring|scheduler"

# Confirm the recurring-rules route is live (should return 401 unauthenticated)
curl -sS -m 5 -o /dev/null -w "%{http_code}\n" https://<host>/api/v1/groups/x/recurring-rules
```

Also see the design spec at `docs/superpowers/specs/2026-07-01-recurring-expenses-design.md` for the materialization algorithm details.

## Project Structure

```
chillbill/
├── apps/
│   ├── backend/          # FastAPI backend
│   │   ├── app/
│   │   │   ├── api/      # API routes
│   │   │   ├── core/     # Config, security, deps
│   │   │   ├── db/       # Models, CRUD
│   │   │   └── services/ # Business logic
│   │   └── tests/        # Backend tests
│   └── web/              # React frontend
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── contexts/
│       │   ├── services/
│       │   └── tests/    # Frontend tests
│       └── public/
├── docker-compose.yml
├── TESTING.md            # Testing documentation
└── README.md
```

## Documentation

- [Testing Guide](./TESTING.md) - How to run and write tests
- [Deployment Guide](./deployment.md) - Deployment instructions
- [API Docs](http://localhost:8000/docs) - Interactive API documentation (when running)

## Contributing

1. Write tests for new features
2. Run test suite before committing
3. Ensure all tests pass
4. Follow existing code style

## License

MIT
