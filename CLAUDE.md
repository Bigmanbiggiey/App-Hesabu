# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hesabu is a multi-tenant SaaS invoicing/tax/payments platform for Kenyan businesses: VAT invoicing with KRA eTIMS integration, M-Pesa (Daraja) and Stripe payments, SMS via Africa's Talking, and in-app + Web Push notifications. Backend is Django REST Framework; frontend is React 19 + TypeScript + Vite, shipped as an installable PWA.

## Commands

### Backend (run from `backend/`, with venv activated)

```bash
python manage.py runserver 0.0.0.0:8001    # dev server
python manage.py migrate                    # apply migrations
python manage.py makemigrations <app>       # after model changes
python manage.py createsuperuser
python manage.py generate_vapid_keys        # prints a VAPID_* key pair for Web Push
celery -A hesabu worker -l info              # async task worker (separate shell)
celery -A hesabu beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler   # scheduled tasks (separate shell)
pytest -q                                    # test suite
black .                                      # formatter
flake8                                       # linter
```

Tests live in `backend/tests/` (pytest + pytest-django + factory_boy; fixtures in `backend/conftest.py`, factories in `tests/factories.py`). `pytest.ini` selects `hesabu.settings.test`: in-memory SQLite, eager Celery, dummy integration credentials, so no services are needed. Tests marked `@pytest.mark.postgres` (the tax-period lock triggers) are skipped on SQLite. Set `TEST_DATABASE_URL=postgres://...` to run them, as CI does. The settings still read `SECRET_KEY` and `DB_PASSWORD` from the environment, so set dummy values if there's no `backend/.env`.

`DJANGO_SETTINGS_MODULE` defaults to `hesabu.settings.base` (`manage.py`/`celery.py`). `hesabu/settings/development.py` extends it (adds `debug_toolbar`, console email backend). `.env.example` sets `DJANGO_SETTINGS_MODULE=hesabu.settings.development`, so a `backend/.env` copied from it uses development settings.

### Frontend (run from `frontend/`)

```bash
npm run dev        # Vite dev server (:5175)
npm run build      # tsc -b && vite build (also builds the service worker)
npm run lint       # eslint
npm run preview    # serve the production build (needed to test the service worker / push)
```

Note: `npm run lint` references an ESLint config, but no `eslint.config.js`/`.eslintrc*` currently exists at the frontend root, so check before relying on it.

Note: the Vite dev proxy in `vite.config.ts` sends `/api` to `http://localhost:8000`, while `start.sh`/`runserver` above use `:8001`. Check this before debugging "API unreachable" in dev.

### CI

`.github/workflows/ci.yml` runs on every push and PR: `backend` runs `pytest -q` against a Postgres 16 service (so the `postgres`-marked tests run), and `frontend` runs `npm ci && npm run build` on Node 22. The Vercel checks on PRs are left over from the old deployment (see Deployment).

### Full stack

```bash
bash setup.sh   # one-time: docker services, venv, deps, migrate, npm install
bash start.sh   # daily: docker services + Django (:8001) + Celery worker + Vite (:5175)
```

Docker Compose (`docker-compose.yml`) only runs Postgres (`5432`) and Redis (mapped to host `6380`, container `6379`). Django/Celery/Vite run on the host, not in containers. `start.sh` does not start Celery beat, so scheduled tasks don't run in dev unless you start beat yourself.

## Architecture

### Multi-tenancy

Every piece of business data belongs to an `Organization` (`apps/accounts/models.py`), a GC firm/tenant identified by KRA PIN, with its own eTIMS device serial, M-Pesa paybill/till, subscription tier, and invoice numbering sequence (`Organization.next_invoice_number()`). `User` (custom `AUTH_USER_MODEL = accounts.User`, email as username) belongs to one `Organization` via FK and has a `role` (`owner`/`admin`/`accountant`/`staff`) checked by `apps/core/permissions.py`.

`apps/core/middleware.py`'s `OrganizationMiddleware` lazily attaches `request.organization` from `request.user.organization` on every request. Views/serializers should scope querysets through this rather than trusting client-supplied org IDs.

All models inherit `apps.core.models.BaseModel`: UUID primary key + `created_at`/`updated_at`.

### Subscription tiers & limits

Three tiers (`SubscriptionTier` in `accounts/models.py`, limits in `apps/billing/limits.py`):
- `biashara`: 2,500 KES/mo, capped at 100 invoices/month & 5 users.
- `kampuni`: 6,500 KES/mo, 15 users, unlimited invoices.
- `shirika`: 15,000 KES/mo, unlimited.

`check_invoice_limit(org)` / `check_user_limit(org)` raise DRF `PermissionDenied` and should be called before creating invoices/users.

Monthly counts (invoice limit, `billing_status` usage, dashboard/report aggregates) all bucket invoices by **`invoice_date`**, not `created_at`, so an invoice always counts toward the same month as the VAT `TaxPeriod` it belongs to.

### App boundaries

- `apps/accounts`: `Organization`, `User`, auth endpoints (JWT via `simplejwt`).
- `apps/invoices`: `Customer`, `Invoice`, `InvoiceLineItem`.
  - VAT is calculated per line item on save (`InvoiceLineItem.save()`: 16% standard / 0% zero-rated / exempt), and `Invoice.recalculate_totals()` aggregates line items into subtotal/VAT/WHT/total.
  - `etims.py` handles KRA eTIMS submission. The invoice carries `etims_status`, `etims_receipt_number`, `etims_qr_code` and the raw `etims_response`. A KRA refusal (non-`"000"` `resultCd`) raises `EtimsRejected`: the invoice is marked `rejected` and finance users are notified, with no retry. Timeouts and network errors raise plain `EtimsError` and are retried with backoff.
  - `pdf.py` renders invoice PDFs (reportlab).
  - `tasks.py` has the async eTIMS submission, PDF generation and the daily `mark_overdue_invoices`.
- `apps/payments`: payment records against invoices (M-Pesa/Stripe/manual). Reconciles `Invoice.amount_paid`/`amount_due`. Matched and unmatched M-Pesa payments both notify finance users.
- `apps/taxes`: `TaxPeriod` (invoices lock to a tax period once filed), VAT and PAYE returns, `Employee`, and the tax return calculators (`calculators.py`). `tasks.py` has the daily `send_filing_reminders`.
- `apps/billing`: subscription billing itself: `daraja.py` (M-Pesa STK push for subscription payments), `stripe_client.py`, `limits.py` (tier enforcement, see above), and the daily trial/subscription expiry tasks.
- `apps/notifications`: per-user notifications and Web Push (see below).
- `apps/core`: shared `BaseModel`, `OrganizationMiddleware`, DRF pagination/permissions, the M-Pesa callback IP allowlist (`decorators.py`), and the SMS wrapper (Africa's Talking).

Business data flows: Customer → Invoice → InvoiceLineItem (VAT computed) → Payment (settles amount_due) → TaxPeriod (locks the invoice once a return is filed) → eTIMS submission (fiscalizes with KRA, separate from payment status).

### Notifications

`apps.notifications.services.notify(org, kind, title, body, url=...)` is the single entry point.
- **Recipients:** by default, one `Notification` row for each active finance user (owner/admin/accountant). Staff don't get them.
- **Delivery:** after commit, `send_push_notifications` is queued, which Web-Pushes each notification to every `PushSubscription` its recipient has. It respects the per-user `NotificationPreference`, which only gates push. The in-app list always gets every kind.
- **Kinds** (`NotificationKind`): `payment_received`, `etims_rejected`, `invoices_overdue`, `filing_reminder`, `test`.
- **No names in titles or bodies.** They can show on a locked phone screen, so they carry amounts and invoice numbers but never customer or payer names.
- **Keys:** push needs `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`. With them empty, push is skipped and the in-app list still works. The frontend fetches the public key from the API, so it's not a build-time variable.
- **API** under `/api/v1/notifications/`:
  - the list/read viewset at the root
  - `push/key/`
  - `push/subscription/`
  - `preferences/`
  - `test/`

### Scheduled tasks

Celery beat runs with `django_celery_beat`'s `DatabaseScheduler`. Entries are declared in `CELERY_BEAT_SCHEDULE` in `settings/base.py`. Times are in `Africa/Nairobi`.
- **00:05 `expire-trials`** (`apps.billing.tasks.expire_trials`)
- **00:10 `expire-subscriptions`** (`apps.billing.tasks.expire_subscriptions`)
- **06:00 `mark-overdue-invoices`:** moves sent/partial invoices past `due_date` to `overdue` and sends one summary notification per org. It is the only thing that sets `overdue`.
- **08:00 `send-filing-reminders`:** VAT on the 17th and PAYE on the 6th, for last month's returns not yet filed. The KRA deadlines are the 20th and the 9th.

### API routing

All API routes are versioned under `/api/v1/` (`hesabu/urls.py`): `auth/`, `invoices/`, `payments/`, `taxes/`, `billing/`, `notifications/`, plus `auth/token/refresh/` for JWT refresh. DRF defaults: JWT auth required on every view (`IsAuthenticated`), `django-filter` + search + ordering backends, 25-item pagination (`apps/core/pagination.py`).

### Frontend data flow

`frontend/src/lib/api.ts` is a single Axios instance (`baseURL: /api/v1`). Its interceptors attach `access_token` from `localStorage` and transparently refresh via `refresh_token` on a 401, redirecting to `/login` if refresh fails. Feature hooks (`useInvoices`, `usePayments`, `useTaxes`, `useCustomers`, `useSettings`, `useDashboardStats`, `useNotifications`) wrap this in TanStack Query. `useAuth`/`AuthContext` gate routing in `App.tsx` (`PrivateRoute`). Pages are grouped by feature under `src/pages/<feature>/`.

### PWA

`vite-plugin-pwa` in `injectManifest` mode builds the custom service worker `src/sw.ts`.
- **Service worker:** it precaches the app shell and serves the SPA fallback, except for `/api/`, `/admin/`, `/static/` and `/media/`. It has no runtime caching of `/api/`, so tenant financial data never lands in the cache. It also shows Web Push notifications and handles clicks on them.
- **Updates:** `registerType: "prompt"`, so a new version waits for the user to accept the update toast.
- **Install:** `src/lib/pwa.ts` captures `beforeinstallprompt` before React mounts. `components/pwa/Install.tsx` renders the install banner and the sidebar "Install app" link, with Add to Home Screen steps on iOS.
- **Push:** `src/lib/push.ts` handles the subscription, and the UI lives in `components/notifications/`. iOS only allows push from the installed home-screen app, so Settings shows an install button there instead.
- **Dev mode:** the service worker isn't registered under `npm run dev`. Use a build (`npm run build && npm run preview`) to test it.

### External integrations

- **KRA eTIMS** (`ETIMS_BASE_URL`/`ETIMS_PIN`): sandbox at `etims-sbx.kra.go.ke`, invoice fiscalization.
- **Safaricom Daraja/M-Pesa** (`DARAJA_*`): sandbox at `sandbox.safaricom.co.ke`. Used both for customer invoice payments (`apps/payments`) and subscription billing STK push (`apps/billing/daraja.py`).
- **Stripe** (`STRIPE_*`): alternative subscription billing.
- **Africa's Talking** (`AT_*`): SMS notifications.
- **Web Push** (`VAPID_*`): `pywebpush`, VAPID-signed.

All external credentials live in `backend/.env` for local dev (see `.env.example` for the full list), and sandbox URLs are the defaults.

### Deployment

Production is **self-hosted on a shared AWS EC2 host**, live at **https://hesabu.techbiggiey.org**. The cutover is done. `vercel.json` (the old Vercel deployment) is still in the repo and its Vercel projects still post checks on PRs, but it's no longer the deployment. Retire it once nothing depends on it.

- **Host:** EC2 **t4g.large** (us-east-2): **ARM64**, 2 vCPU, 7.6 GiB RAM, **no swap**, Ubuntu 24.04, Docker 28 + Compose v2.34. SSH as `ubuntu` (key-only). No Tailscale. Hostname `ip-172-31-13-28`, public IP `3.136.181.88`. The deployment lives in `~/hesabu`, a clone of this repo on `main`, with the production `.env` at the repo root.
- **The host is shared with projects that aren't ours, and Hesabu must never touch them.** That covers:
  - host nginx on 80/443 (Jenkins at `jenkins.albisai.com`, certbot)
  - Jenkins (8080/50000)
  - the `devops-copilot` compose project (port 8000, network `devops-copilot_default` 172.18/16)
  - 7 `buildx_buildkit_*` builders plus their volumes and build cache

  Never prune Docker resources, never edit `/etc/nginx`, `/etc/docker` or the host firewall, and never use another tenant's buildx builder (build with `BUILDX_BUILDER=default`). Don't reboot the host or apply kernel upgrades without the host owner.
- `docker-compose.prod.yml` is therefore fully self-contained:
  - `name: hesabu`, 7 services, **no published host ports, no external networks**.
  - Its own network is pinned to `172.30.0.0/24`.
  - Every service has a `mem_limit`, because there is no swap and other tenants' builds spike memory.
  - Every service has per-service json-file log rotation (the daemon doesn't rotate logs).
  - gunicorn runs 2 workers and Celery concurrency is 2, sized for 2 shared vCPUs.
  - Services: `db` (postgres:16-alpine), `redis`, `backend` (gunicorn), `celery-worker`, `celery-beat`, `frontend` (`hesabu-nginx-1`, SPA + reverse proxy for `/api/`, `/admin/`, `/static/`), and `cloudflared`.
- **Ingress is Hesabu's own Cloudflare Tunnel.** The `cloudflared` container dials out to Cloudflare (outbound 7844) using `CLOUDFLARE_TUNNEL_TOKEN` from `.env`. The tunnel's public hostname `hesabu.techbiggiey.org` routes to `http://hesabu-nginx-1:80`. Cloudflare terminates TLS. Nothing listens on the host.
- **Client IP chain:** client → Cloudflare edge → cloudflared → nginx → gunicorn.
  - `frontend/nginx.conf` trusts `CF-Connecting-IP` only from `172.30.0.0/24` (realip module).
  - It sends Django `X-Forwarded-For: $remote_addr`, a single trusted IP that overwrites rather than appends.
  - Why it matters: `apps/core/decorators.py`'s M-Pesa callback allowlist reads the last XFF hop. If nginx appended instead, every Safaricom callback would be rejected as coming from cloudflared's container IP.
  - Keep the subnet in `nginx.conf` and in the compose network in sync.
- `backend/hesabu/settings/production.py` extends `base.py` with `DEBUG=False`, `SECURE_PROXY_SSL_HEADER` (nginx always sends `X-Forwarded-Proto: https`), HSTS and secure cookies, required `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS`, and whitenoise for `/static/`. It is selected via the compose `environment:` and not baked into the image.
- **Media files:** `static()` in `hesabu/urls.py` is a no-op when `DEBUG=False`. `backend`/`celery-worker` and `frontend` share the `hesabu_media` volume, and nginx serves `/media/` from it. Only `Organization.logo` is persisted; invoice PDFs are generated in memory.
- `backend/docker-entrypoint.sh` runs `migrate`/`collectstatic` only when the command starts with `gunicorn`, so migrations apply on every `up -d` of `backend`. Celery services wait for `backend` to be healthy.
- Images are built **natively on the server** (arm64). There is no registry and no cross-build. The deploy commands are in `README.md`.
- **Backups:** before a deploy that migrates, dump the DB to `~/hesabu-backups/` on the host (command in `README.md`). These are manual and on the same disk. Nothing automated or off-box exists yet.

**Still pending:**
- **Integrations aren't configured in production.** They fall back to the `base.py` defaults (sandbox URLs, empty credentials), because the prod `.env` doesn't set `ETIMS_*`, `DARAJA_*` (including the callback URLs and `DARAJA_ALLOWED_IPS`), `STRIPE_*` or `AT_*`. Live credentials and callbacks pointed at `https://hesabu.techbiggiey.org` are needed before real payments or fiscalization.
- **Automated, off-box DB backups.** The host's AWS CLI creds are invalid, so this needs new creds or another destination.
- **Retiring Vercel:** remove `vercel.json` and disconnect the Vercel projects.
