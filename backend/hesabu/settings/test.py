"""
Test settings — fast, hermetic, no external services.

Uses an in-memory SQLite database so the suite runs without Postgres/Docker.
Postgres-specific behaviour (e.g. the tax-period DB triggers) is covered by
tests marked ``@pytest.mark.postgres`` which are skipped on SQLite.
"""
from .base import *  # noqa

DEBUG = False

# ── Throttling ───────────────────────────────────────────────────────────────
# Keep the auth/register scopes at real (testable) values; lift the blanket
# anon/user limits so the rest of the suite isn't rate-limited.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "anon": "100000/min",
    "user": "100000/min",
    "auth": "5/min",
    "register": "3/hour",
}

# ── Database ──────────────────────────────────────────────────────────────────
# Default: in-memory SQLite (no services needed). CI sets TEST_DATABASE_URL to
# a PostgreSQL DSN so the @pytest.mark.postgres trigger tests actually run.
_test_db_url = env("TEST_DATABASE_URL", default="")
if _test_db_url:
    DATABASES = {"default": env.db_url_config(_test_db_url)}
else:
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
