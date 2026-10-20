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

Monthly counts (invoice limit, `billing_status` usage, dashboard/report aggregates) all bucket invoices by **`invoice_date`**, not `created_at`, so an invoice always counts toward the same month as the VAT `TaxPeriod` it belongs to.

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

Hesabu is moving off Vercel (`vercel.json`, still in the repo and still the live deployment) to self-hosting on a **shared AWS EC2 host**. The repo-side pieces exist; the server-side cutover is pending.

- Host: EC2 **t4g.large** (us-east-2): **ARM64**, 2 vCPU, 7.6 GiB RAM, **no swap**, Ubuntu 24.04, Docker 28 + Compose v2.34. SSH as `ubuntu` (key-only). No Tailscale. Hostname `ip-172-31-13-28`, public IP `3.136.181.88`. The planned directory is `~/hesabu` (or `/srv/hesabu`).
- **The host is shared with projects that aren't ours, and Hesabu must never touch them.** That covers host nginx on 80/443 (Jenkins at `jenkins.albisai.com`, certbot), Jenkins (8080/50000), the `devops-copilot` compose project (port 8000, network `devops-copilot_default` 172.18/16), and 7 `buildx_buildkit_*` builders plus their volumes and build cache. Never prune Docker resources, never edit `/etc/nginx`, `/etc/docker` or the host firewall, and never use another tenant's buildx builder (build with `BUILDX_BUILDER=default`).
- `docker-compose.prod.yml` is therefore fully self-contained:
  - `name: hesabu`, 7 services, **no published host ports, no external networks**.
  - Its own network is pinned to `172.30.0.0/24`.
  - Every service has a `mem_limit`, because there is no swap and other tenants' builds spike memory.
  - Every service has per-service json-file log rotation (the daemon doesn't rotate logs).
  - gunicorn runs 2 workers and Celery concurrency is 2, sized for 2 shared vCPUs.
  - Services: `db` (postgres:16-alpine), `redis`, `backend` (gunicorn), `celery-worker`, `celery-beat`, `frontend` (`hesabu-nginx-1`, SPA + reverse proxy for `/api/`, `/admin/`, `/static/`), and `cloudflared`.
- **Ingress is Hesabu's own Cloudflare Tunnel.** The `cloudflared` container dials out to Cloudflare (outbound 7844 is confirmed open) using `CLOUDFLARE_TUNNEL_TOKEN` from `.env`. The tunnel's public hostname routes to `http://hesabu-nginx-1:80`. Cloudflare terminates TLS. Nothing listens on the host.
- **Client IP chain:** client → Cloudflare edge → cloudflared → nginx → gunicorn. `frontend/nginx.conf` trusts `CF-Connecting-IP` only from `172.30.0.0/24` (realip module) and sends Django `X-Forwarded-For: $remote_addr`, a single trusted IP that overwrites rather than appends. `apps/core/decorators.py`'s M-Pesa callback allowlist reads the last XFF hop, so if nginx appended instead, every Safaricom callback would be rejected as coming from cloudflared's container IP. Keep the subnet in `nginx.conf` and in the compose network in sync.
- `backend/hesabu/settings/production.py` extends `base.py` with `DEBUG=False`, `SECURE_PROXY_SSL_HEADER` (nginx always sends `X-Forwarded-Proto: https`), HSTS and secure cookies, required `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS`, and whitenoise for `/static/`. It is selected via the compose `environment:` and not baked into the image.
- **Media files:** `static()` in `hesabu/urls.py` is a no-op when `DEBUG=False`. `backend`/`celery-worker` and `frontend` share the `hesabu_media` volume, and nginx serves `/media/` from it. Only `Organization.logo` is persisted; invoice PDFs are generated in memory.
- `backend/docker-entrypoint.sh` runs `migrate`/`collectstatic` only when the command starts with `gunicorn`. Celery services wait for `backend` to be healthy.
- Images are built **natively on the server** (arm64). There is no registry and no cross-build.

**Still pending:**
- the public domain, on a Cloudflare account we control
- creating the tunnel and its public-hostname route
- SSH access from this machine
- the production `.env` (see `.env.example` "Production overrides")
- the first `build` + `up -d` + `createsuperuser`
- pointing the Daraja/Stripe callbacks at the new domain
- DB backups. The host's AWS CLI creds are invalid, so off-box backups need new creds or another destination.

Then retire `vercel.json`. See `README.md` for local verification and deploy commands.
