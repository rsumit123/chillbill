SHELL := /bin/bash
BACKEND_DIR := apps/backend
WEB_DIR := apps/web

.PHONY: install dev backend web migrate seed test lint format openapi

install: install-backend install-web

install-backend:
	pip install -r $(BACKEND_DIR)/requirements.txt -r $(BACKEND_DIR)/requirements-dev.txt

install-web:
	if [ -d "$(WEB_DIR)" ]; then (cd $(WEB_DIR) && pnpm install || npm install); else echo "web not initialized yet"; fi

backend:
	cd $(BACKEND_DIR) && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

web:
	cd $(WEB_DIR) && (pnpm dev || npm run dev)

# Run backend and web concurrently
dev:
	bash -lc '\
	  (cd $(BACKEND_DIR) && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) & \
	  BACK_PID=$$!; \
	  if [ -d "$(WEB_DIR)" ]; then (cd $(WEB_DIR) && (pnpm dev || npm run dev)) & WEB_PID=$$!; fi; \
	  wait'

migrate:
	cd $(BACKEND_DIR) && alembic upgrade head

seed:
	cd $(BACKEND_DIR) && python -m app.db.seed

pytest:
	cd $(BACKEND_DIR) && pytest -q

ruff:
	cd $(BACKEND_DIR) && ruff check .

black:
	cd $(BACKEND_DIR) && black .

lint: ruff
format: black

openapi:
	cd $(BACKEND_DIR) && curl -s http://localhost:8000/openapi.json -o ../web/src/services/api/openapi.json || true
