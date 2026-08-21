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

**Migration in progress**: Hesabu is moving to self-hosting on `server-biggiey`, alongside the team's other projects (`essenshea`, `educore`), served at `hesabu.techbiggiey.org` via Cloudflare Tunnel + Caddy, running as Docker containers (nginx, Django backend, Postgres). The `Dockerfile` and production compose file for this haven't been added yet — see `CLAUDE.md` for the full target architecture. Until the cutover, Vercel remains the live deployment.

## License

Proprietary — all rights reserved.
