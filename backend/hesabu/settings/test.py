"""
Test settings — fast, hermetic, no external services.

Uses an in-memory SQLite database so the suite runs without Postgres/Docker.
Postgres-specific behaviour (e.g. the tax-period DB triggers) is covered by
tests marked ``@pytest.mark.postgres`` which are skipped on SQLite.
"""
from .base import *  # noqa

DEBUG = False

# ── Database ──────────────────────────────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# ── Speed ─────────────────────────────────────────────────────────────────────
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# ── Neutralise external integrations ──────────────────────────────────────────
STRIPE_SECRET_KEY = "sk_test_dummy"
STRIPE_WEBHOOK_SECRET = "whsec_dummy"
DARAJA_CONSUMER_KEY = "dummy"
DARAJA_CONSUMER_SECRET = "dummy"
DARAJA_PASSKEY = "dummy"
DARAJA_SHORTCODE = "174379"
AT_API_KEY = ""  # send_sms() short-circuits when unset

# IPs permitted to call the Daraja callback endpoints (PR3). Empty in tests
# unless a test overrides it, so the allowlist decorator can be exercised.
DARAJA_ALLOWED_IPS = []
