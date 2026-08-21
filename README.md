# Hesabu

Hesabu is a multi-tenant invoicing, tax, and payments platform for Kenyan businesses. It handles VAT-compliant invoicing with **KRA eTIMS** integration, **M-Pesa (Daraja)** and **Stripe** payment collection, and SMS notifications via **Africa's Talking**.

## Stack

- **Backend**: Django 5 + Django REST Framework, JWT auth (`djangorestframework-simplejwt`), Celery + Redis for async work (PDF generation, eTIMS submission, SMS/email), PostgreSQL.
- **Frontend**: React 19 + TypeScript + Vite, TanStack Query for data fetching, React Router, Tailwind CSS, React Hook Form + Zod.

## Getting started

Requires Docker, Python 3, and Node.js.

```bash
bash setup.sh   # one-time: starts Postgres/Redis, creates venv, installs deps, runs migrations
bash start.sh   # every day: starts Postgres/Redis, Django, Celery worker, and Vite dev server
```

- Frontend: http://localhost:5175
- Backend API: http://localhost:8001/api/v1/
- Django admin: http://localhost:8001/admin

Copy `.env.example` to `backend/.env` and fill in credentials for eTIMS, Daraja, Stripe, Africa's Talking, and email before exercising those integrations.

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

# Frontend (separate shell)
cd frontend
npm install
npm run dev
```

## Deployment

Currently deployed to Vercel as two services defined in `vercel.json`: the Vite frontend at `/` and the Django backend at `/_/backend` (`frontend/` and `backend/` roots respectively).

**Migration in progress**: Hesabu is moving to self-hosting on `server-biggiey`, alongside the team's other projects (`essenshea`, `educore`), served at `hesabu.techbiggiey.org` via Cloudflare Tunnel + Caddy, running as Docker containers (nginx, Django backend, Postgres, Redis, Celery worker/beat) defined in `docker-compose.prod.yml`. See `CLAUDE.md` for the full architecture and what's still pending server-side. Until the cutover is confirmed live, Vercel remains the active deployment.

#### Testing the production stack locally

The production stack can be built and smoke-tested on a dev machine before it ever touches the real server:

```bash
# .env.prod.local — dummy prod-shaped values, git-ignored
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
EOF

# docker-compose.prod.local.yml — publishes a host port and makes the
# server's external Caddy network a plain local one instead, git-ignored
cat > docker-compose.prod.local.yml <<'EOF'
services:
  frontend:
    ports:
      - "8080:80"
networks:
  server_backend:
    external: false
EOF

docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod.local up --build
```

Then check: `http://localhost:8080/` (React shell), `http://localhost:8080/api/v1/auth/token/refresh/` (JSON, not an nginx error page), `http://localhost:8080/admin/` (styled login page — confirms whitenoise), and that an uploaded `Organization.logo` is reachable at `http://localhost:8080/media/logos/<file>`. Tear down with `docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml down -v`.

#### Deploying (once the server-side cutover is done)

```bash
ssh -i ~/.ssh/essenshea_biggiey biggiey@server-biggiey.tailfbb86e.ts.net
cd /srv/docker/apps/hesabu && git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser   # first deploy only
```

## License

Proprietary — all rights reserved.
