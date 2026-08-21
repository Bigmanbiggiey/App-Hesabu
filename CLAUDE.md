# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hesabu is a multi-tenant SaaS invoicing/tax/payments platform for Kenyan businesses: VAT invoicing with KRA eTIMS integration, M-Pesa (Daraja) and Stripe payments, SMS via Africa's Talking. Backend is Django REST Framework; frontend is React 19 + TypeScript + Vite.

## Commands

### Backend (run from `backend/`, with venv activated)

```bash
python manage.py runserver 0.0.0.0:8001    # dev server
python manage.py migrate                    # apply migrations
python manage.py makemigrations <app>       # after model changes
python manage.py createsuperuser
celery -A hesabu worker -l info              # async task worker (separate shell)
black .                                      # formatter
flake8                                       # linter
```

There is currently no test suite in `backend/` — no `tests.py`/`test_*.py` files exist in any app.

`DJANGO_SETTINGS_MODULE` defaults to `hesabu.settings.base` (`manage.py`/`celery.py`). `hesabu/settings/development.py` extends it (adds `debug_toolbar`, console email backend) — set `DJANGO_SETTINGS_MODULE=hesabu.settings.development` to use it explicitly.

### Frontend (run from `frontend/`)

```bash
npm run dev        # Vite dev server
npm run build       # tsc -b && vite build
npm run lint         # eslint
npm run preview
```

Note: `npm run lint` references an ESLint config, but no `eslint.config.js`/`.eslintrc*` currently exists at the frontend root — check before relying on it.

### Full stack

```bash
bash setup.sh   # one-time: docker services, venv, deps, migrate, npm install
bash start.sh   # daily: docker services + Django (:8001) + Celery worker + Vite (:5175)
```

Docker Compose (`docker-compose.yml`) only runs Postgres (`5432`) and Redis (mapped to host `6380`, container `6379`) — Django/Celery/Vite run on the host, not in containers.

## Architecture

### Multi-tenancy

Every piece of business data belongs to an `Organization` (`apps/accounts/models.py`) — a GC firm/tenant identified by KRA PIN, with its own eTIMS device serial, M-Pesa paybill/till, subscription tier, and invoice numbering sequence (`Organization.next_invoice_number()`). `User` (custom `AUTH_USER_MODEL = accounts.User`, email as username) belongs to one `Organization` via FK and has a `role` (`owner`/`admin`/`accountant`/`staff`) checked by `apps/core/permissions.py`.

`apps/core/middleware.py`'s `OrganizationMiddleware` lazily attaches `request.organization` from `request.user.organization` on every request — views/serializers should scope querysets through this rather than trusting client-supplied org IDs.

All models inherit `apps.core.models.BaseModel`: UUID primary key + `created_at`/`updated_at`.

### Subscription tiers & limits

Three tiers (`SubscriptionTier` in `accounts/models.py`, limits in `apps/billing/limits.py`): `biashara` (2,500 KES/mo, capped at 100 invoices/month & 5 users), `kampuni` (6,500 KES/mo, 15 users, unlimited invoices), `shirika` (15,000 KES/mo, unlimited). `check_invoice_limit(org)` / `check_user_limit(org)` raise DRF `PermissionDenied` and should be called before creating invoices/users.

### App boundaries

- `apps/accounts` — `Organization`, `User`, auth endpoints (JWT via `simplejwt`).
- `apps/invoices` — `Customer`, `Invoice`, `InvoiceLineItem`; VAT calculated per line item on save (`InvoiceLineItem.save()`: 16% standard / 0% zero-rated / exempt); `Invoice.recalculate_totals()` aggregates line items into subtotal/VAT/WHT/total; `etims.py` handles KRA eTIMS submission (invoice carries `etims_status`, `etims_receipt_number`, `etims_qr_code`, raw `etims_response`); `pdf.py` renders invoice PDFs (reportlab); `tasks.py` for async submission/PDF generation via Celery.
- `apps/payments` — payment records against invoices (M-Pesa/Stripe/manual), reconciles `Invoice.amount_paid`/`amount_due`.
- `apps/taxes` — `TaxPeriod` (invoices lock to a tax period once filed) and tax return calculators.
- `apps/billing` — subscription billing itself: `daraja.py` (M-Pesa STK push for subscription payments), `stripe_client.py`, `limits.py` (tier enforcement, see above).
- `apps/core` — shared `BaseModel`, `OrganizationMiddleware`, DRF pagination/permissions, SMS wrapper (Africa's Talking).

Business data flows: Customer → Invoice → InvoiceLineItem (VAT computed) → Payment (settles amount_due) → TaxPeriod (locks the invoice once a return is filed) → eTIMS submission (fiscalizes with KRA, separate from payment status).

### API routing

All API routes are versioned under `/api/v1/` (`hesabu/urls.py`): `auth/`, `invoices/`, `payments/`, `taxes/`, `billing/`, plus `auth/token/refresh/` for JWT refresh. DRF defaults: JWT auth required on every view (`IsAuthenticated`), `django-filter` + search + ordering backends, 25-item pagination (`apps/core/pagination.py`).

### Frontend data flow

`frontend/src/lib/api.ts` is a single Axios instance (`baseURL: /api/v1`) with interceptors that attach `access_token` from `localStorage` and transparently refresh via `refresh_token` on a 401, redirecting to `/login` if refresh fails. Feature hooks (`useInvoices`, `usePayments`, `useTaxes`, `useCustomers`, `useSettings`, `useDashboardStats`) wrap this in TanStack Query. `useAuth`/`AuthContext` gate routing in `App.tsx` (`PrivateRoute`); pages are grouped by feature under `src/pages/<feature>/`.

### External integrations

- **KRA eTIMS** (`ETIMS_BASE_URL`/`ETIMS_PIN`) — sandbox at `etims-sbx.kra.go.ke`, invoice fiscalization.
- **Safaricom Daraja/M-Pesa** (`DARAJA_*`) — sandbox at `sandbox.safaricom.co.ke`, used both for customer invoice payments (`apps/payments`) and subscription billing STK push (`apps/billing/daraja.py`).
- **Stripe** (`STRIPE_*`) — alternative subscription billing.
- **Africa's Talking** (`AT_*`) — SMS notifications.

All external credentials live in `backend/.env` (see `.env.example` for the full list); sandbox URLs are the defaults.

### Deployment

Hesabu is moving off Vercel (`vercel.json`, currently still in the repo) to self-hosting on **server-biggiey**, following the same pattern already used there for `essenshea` and `educore`:

- Host: `server-biggiey` (Ubuntu 26.04, reachable over Tailscale at `100.72.18.28` / `server-biggiey.tailfbb86e.ts.net`).
- Target path: `/srv/docker/apps/hesabu/` with `docker-compose.yml` + `docker-compose.prod.yml` (analogous to `essenshea`'s layout). **Not created yet** — this repo has no `Dockerfile` or production compose file; only the local dev `docker-compose.yml` (Postgres + Redis) exists.
- Expected containers once deployed: `hesabu-nginx-1`, `hesabu-backend-1`, `hesabu-db-1` (frontend served via nginx, Django backend, Postgres — mirrors `essenshea`'s 3-container shape).
- Public ingress: **`hesabu.techbiggiey.org`**, added to the box's Cloudflare Tunnel config (`/home/biggiey/.cloudflared/config.yml`) and routed through the shared Caddy reverse proxy (`/srv/docker/infrastructure/caddy/Caddyfile`) by Host header — same mechanism as `educore-admin.techbiggiey.org` / `essenshea-demo.techbiggiey.org`.
- Deploy access: SSH key `~/.ssh/essenshea_biggiey` (ed25519, comment `essenshea-demo-deploy`) on this machine — reused for server-biggiey access generally, not Hesabu-specific. No `~/.ssh/config` host alias exists for it yet.

None of the server-side pieces (compose file, Dockerfile, Caddy route, Cloudflare ingress entry) exist yet as of this writing — treat this as the target architecture, not a live deployment. `vercel.json` is still the active config until the cutover happens.
