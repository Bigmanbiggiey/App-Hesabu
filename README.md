# Hesabu

Hesabu is a multi-tenant invoicing, tax, and payments platform for Kenyan businesses. It handles VAT-compliant invoicing with **KRA eTIMS** integration, VAT and PAYE returns, **M-Pesa (Daraja)** and **Stripe** payment collection, SMS via **Africa's Talking**, and in-app + Web Push notifications. The web app installs as a PWA on phones and desktops.

Production: **https://hesabu.techbiggiey.org**

## Stack

- **Backend**: Django 5 + Django REST Framework, JWT auth (`djangorestframework-simplejwt`), PostgreSQL. Celery + Redis handle async work (PDF generation, eTIMS submission, SMS/email, push) and Celery beat runs the daily jobs.
- **Frontend**: React 19 + TypeScript + Vite, TanStack Query for data fetching, React Router, Tailwind CSS, React Hook Form + Zod. `vite-plugin-pwa` builds a custom service worker (`src/sw.ts`) for installability, offline shell and Web Push.

## Getting started

Requires Docker, Python 3.12, and Node.js 20+.

```bash
bash setup.sh   # one-time: starts Postgres/Redis, creates venv, installs deps, runs migrations
bash start.sh   # every day: starts Postgres/Redis, Django, Celery worker, and Vite dev server
```

- Frontend: http://localhost:5175
- Backend API: http://localhost:8001/api/v1/
- Django admin: http://localhost:8001/admin

Copy `.env.example` to `backend/.env` and fill in credentials for eTIMS, Daraja, Stripe, Africa's Talking, and email before exercising those integrations. For push notifications, generate VAPID keys with `python manage.py generate_vapid_keys >> .env` (from `backend/`).

`start.sh` doesn't start Celery beat, so the daily jobs (overdue invoices, filing reminders, trial/subscription expiry) only run if you start it yourself (see below). The service worker isn't registered by `npm run dev`. To try installing the app or push notifications locally, use `npm run build && npm run preview`.

### Secret handling

`backend/.env` and the server's `.env` are git-ignored and must never be committed. `backend/.env` *was* tracked in the initial commit (removed in `7c1c4f37`). It only ever held sandbox values (placeholder `SECRET_KEY`, Safaricom's public sandbox passkey), but if this repo is ever made public those revisions should be scrubbed (`git filter-repo --path backend/.env --invert-paths`) and any real credentials rotated.

A `.pre-commit-config.yaml` (gitleaks, `detect-private-key`, black and basic hygiene hooks) guards against re-introducing secrets. Run `pip install pre-commit && pre-commit install`.

### Manual setup

```bash
# Backend
docker compose up -d
cd backend
python -m venv .venv && source .venv/Scripts/activate  # or .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8001

# Celery worker (separate shell)
cd backend && celery -A hesabu worker -l info

# Celery beat, for scheduled tasks (separate shell, optional in dev)
cd backend && celery -A hesabu beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler

# Frontend (separate shell)
cd frontend
npm install
npm run dev
```

## Tests

```bash
cd backend && pytest -q
```

The suite (`backend/tests/`) uses `hesabu.settings.test`: in-memory SQLite, eager Celery and dummy integration credentials, so no services are needed. Tests that depend on PostgreSQL triggers are marked `postgres` and skipped on SQLite. Point `TEST_DATABASE_URL` at a Postgres database to run them too.

CI (`.github/workflows/ci.yml`) runs on every push and pull request:
- the backend suite against Postgres 16
- `npm ci && npm run build` for the frontend

## Installing the app (PWA)

Open https://hesabu.techbiggiey.org and log in.

- **Android (Chrome, Edge, Samsung Internet):** tap **Install** on the banner or **Install app** in the sidebar. Or use the browser menu → *Install app* / *Add to Home screen*.
- **iPhone / iPad (Safari only):** tap **Install** for the steps, which are **Share** → **Add to Home Screen** → **Add**. On iOS, push notifications only work in the installed app (iOS 16.4+).
- **Desktop Chrome / Edge:** **Install app** in the sidebar, or the install icon in the address bar. Desktop Firefox and Safari don't offer installation.

Turn on push in **Settings** after installing. Notifications go to owners, admins and accountants.

## Deployment

Hesabu is self-hosted on a shared AWS EC2 host (ARM64) as a fully self-contained Docker Compose project, `docker-compose.prod.yml`. It runs nginx (SPA + reverse proxy), the Django backend (gunicorn), Postgres, Redis, a Celery worker, Celery beat, and its own Cloudflare Tunnel connector (`cloudflared`) for public HTTPS. The host runs other people's projects, so the stack publishes no host ports and touches nothing outside itself. See `CLAUDE.md` for the full architecture and the rules for sharing the host.

`vercel.json` is left over from the previous Vercel deployment and is due to be removed. Its Vercel checks on pull requests can be ignored.

#### Deploying

Run on the server, from Hesabu's own directory (`~/hesabu`) only. The rules:
- Never run `docker system/image/volume/builder prune`. The build cache and buildx builders belong to other tenants.
- Pin the default builder, so the build doesn't land on another tenant's buildx builder.
- The Docker commands need `sudo` on the server.

```bash
cd ~/hesabu && git checkout main && git pull

# Back up the database first (migrations run automatically on start)
mkdir -p ~/hesabu-backups
sudo docker exec hesabu-db-1 sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > ~/hesabu-backups/hesabu-$(date -u +%Y%m%dT%H%M%SZ).sql.gz

sudo env BUILDX_BUILDER=default docker compose -f docker-compose.prod.yml --env-file .env build
sudo docker compose -f docker-compose.prod.yml --env-file .env up -d
sudo docker compose -f docker-compose.prod.yml ps       # backend should report (healthy)
```

First deploy only:

```bash
sudo docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
# Web Push keys, written straight into .env so the private key is never displayed
sudo docker compose -f docker-compose.prod.yml run --rm -T --no-deps backend \
  python manage.py generate_vapid_keys >> .env
```

To restore a backup: `gunzip -c <file> | sudo docker exec -i hesabu-db-1 sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'` (into an empty database).

#### Testing the production stack locally

The production stack can be built and smoke-tested on a dev machine before it touches the real server:

```bash
# .env.prod.local: dummy prod-shaped values, git-ignored
cat > .env.prod.local <<'EOF'
SECRET_KEY=local-test-secret-key
DEBUG=False
ALLOWED_HOSTS=localhost
CORS_ALLOWED_ORIGINS=http://localhost:8080
CSRF_TRUSTED_ORIGINS=http://localhost:8080
DB_NAME=hesabu
DB_USER=hesabu_user
DB_PASSWORD=hesabu_pass
DB_HOST=db
DB_PORT=5432
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
FRONTEND_URL=http://localhost:8080
CLOUDFLARE_TUNNEL_TOKEN=unused-locally
HESABU_ENV_FILE=.env.prod.local
EOF

# docker-compose.prod.local.yml: publishes a host port (the real server
# publishes none), git-ignored
cat > docker-compose.prod.local.yml <<'EOF'
services:
  frontend:
    ports:
      - "8080:80"
EOF

docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod.local up --build --scale cloudflared=0
```

Then check:
- `http://localhost:8080/` shows the React shell.
- `http://localhost:8080/api/v1/auth/token/refresh/` returns JSON, not an nginx error page.
- `http://localhost:8080/admin/` shows a styled login page, which confirms whitenoise is serving static files.
- An uploaded `Organization.logo` is reachable at `http://localhost:8080/media/logos/<file>`.

Tear down with `docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml down -v`.

## License

Proprietary. All rights reserved.
