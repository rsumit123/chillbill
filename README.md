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
