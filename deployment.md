## ChillBill Deployment Guide

This document captures the steps to deploy the ChillBill app with:
- Backend on a single GCP VM using Docker Compose, SQLite on a persistent host directory, and a reverse proxy with TLS
- Frontend on Vercel

### Prerequisites
- A GCP VM (Linux) with Docker and docker-compose-plugin installed
- A domain for the API (example used below: `chillbill-api.skdev.one`) and for the web app (example: `chillbill.skdev.one`)
- Reverse proxy on the VM (Nginx or Caddy). If you already have one for other apps, reuse it

### 1) DNS
Create an A record for the API domain pointing to the VM public IP.
- Name: `chillbill-api.skdev.one`
- Type: A
- Value: <VM public IP>

If you host the UI on a custom domain (instead of only Vercel), also point `chillbill.skdev.one` to your frontend hosting.

### 2) Backend container on the VM
Clone or sync the repo on the VM and work from the repo root (`/home/<user>/chillbill`). Create a persistent directory for SQLite/uploads and a compose override.

```bash
sudo mkdir -p /srv/chillbill-data
```

Create `docker-compose.override.yml` with a localhost-bound port and required environment variables. Note: `BACKEND_CORS_ORIGINS` MUST be a JSON array string.

```yaml
services:
  backend:
    ports:
      - "127.0.0.1:8001:8000"  # unique host port, bound to localhost
    environment:
      DB_URL: sqlite+aiosqlite:////data/chillbill.db
      UPLOADS_DIR: /data/uploads/receipts
      JWT_SECRET: change_me_to_a_strong_secret
      JWT_ALGO: HS256
      ACCESS_TOKEN_EXPIRE_MINUTES: "30"
      REFRESH_TOKEN_EXPIRE_MINUTES: "43200"
      BACKEND_CORS_ORIGINS: '["https://chillbill.skdev.one"]'
    volumes:
      - /srv/chillbill-data:/data
```

Bring up only the backend service:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d backend
```

Check status and logs:

```bash
docker compose ps backend
docker compose logs -f backend
```

Optional: verify envs inside the container

```bash
docker compose exec backend sh -lc 'python - <<PY
import os, json
print("DB_URL=", os.getenv("DB_URL"))
print("BACKEND_CORS_ORIGINS=", os.getenv("BACKEND_CORS_ORIGINS"))
print("Parsed CORS:", json.loads(os.getenv("BACKEND_CORS_ORIGINS","[]")))
print("UPLOADS_DIR=", os.getenv("UPLOADS_DIR"))
PY'
```

### 3) Reverse proxy and TLS
Route `https://chillbill-api.skdev.one` → `127.0.0.1:8001` and issue TLS.

Option A — Nginx (common):
1. Create a server block `/etc/nginx/sites-available/chillbill-api`:

```nginx
server {
    listen 80;
    server_name chillbill-api.skdev.one;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

2. Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/chillbill-api /etc/nginx/sites-enabled/chillbill-api
sudo nginx -t && sudo systemctl reload nginx
```

3. Issue TLS with certbot:

```bash
sudo certbot --nginx -d chillbill-api.skdev.one --redirect -m you@example.com --agree-tos -n
```

Option B — Caddy (simplest TLS):
Edit `/etc/caddy/Caddyfile`:

```caddy
chillbill-api.skdev.one {
  reverse_proxy 127.0.0.1:8001
}
```

Reload:

```bash
sudo systemctl reload caddy
```

### 4) Frontend on Vercel
- Project root: `apps/web`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable:
  - `VITE_API_BASE=https://chillbill-api.skdev.one/api/v1`

Deploy the site, then your web app will call the API at the given base URL.

### 5) Verification
Backend health:

```bash
curl -i https://chillbill-api.skdev.one/healthz
```

CORS preflight from your machine (UI origin → API):

```bash
curl -i -X OPTIONS https://chillbill-api.skdev.one/api/v1/healthz \
  -H "Origin: https://chillbill.skdev.one" \
  -H "Access-Control-Request-Method: GET"
```

You should see `Access-Control-Allow-Origin: https://chillbill.skdev.one` and `Access-Control-Allow-Credentials: true`.

### Troubleshooting
- Container not running / exits immediately:
  - `docker compose logs --tail=200 backend`
  - Ensure `/srv/chillbill-data` exists and is writeable
  - Run from the repo root so compose files are found
- CORS error in browser:
  - `BACKEND_CORS_ORIGINS` must be a JSON array string, e.g. `'["https://chillbill.skdev.one"]'`
  - Frontend must use `VITE_API_BASE=https://chillbill-api.skdev.one/api/v1`
  - Redeploy both backend and frontend after changes
- Multiple apps on one VM:
  - Bind each backend to a different localhost port (e.g., 8001, 8002)
  - Route by hostname in the reverse proxy
- TLS issues:
  - Nginx: re-run certbot or check DNS; Caddy: ensure service reloaded and domain resolves to VM

### Notes and future scaling
- Current setup uses SQLite and local uploads under `/data` (mounted to `/srv/chillbill-data`). This is great for a single instance
- To scale across instances: switch to Postgres (e.g., managed DB) and store uploads in object storage (e.g., S3/GCS), then run multiple backend replicas behind the proxy


