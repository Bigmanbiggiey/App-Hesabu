from pathlib import Path
import environ
from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_celery_beat",
    "django_celery_results",
    "django_filters",
]

LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    "apps.invoices",
    "apps.payments",
    "apps.taxes",
    "apps.billing",
    "apps.notifications",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.OrganizationMiddleware",
]

ROOT_URLCONF = "hesabu.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "hesabu.wsgi.application"
ASGI_APPLICATION = "hesabu.asgi.application"

# ── Database ──────────────────────────────────────────────────────────────────
# DB_PASSWORD has no default on purpose — every environment must supply one
# via .env (see .env.example) rather than silently falling back to a shared
# weak value.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME", default="hesabu"),
        "USER": env("DB_USER", default="hesabu_user"),
        "PASSWORD": env("DB_PASSWORD"),
        "HOST": env("DB_HOST", default="localhost"),
        "PORT": env("DB_PORT", default="5432"),
        "CONN_MAX_AGE": env.int("DB_CONN_MAX_AGE", default=60),
        "OPTIONS": {
            "connect_timeout": 10,
        },
    }
}

# ── Auth ──────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ── REST Framework ────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON", default="30/min"),
        "user": env("THROTTLE_USER", default="2000/hour"),
        # Tight scopes for the unauthenticated / abuse-prone auth endpoints.
        "auth": env("THROTTLE_AUTH", default="10/min"),
        "register": env("THROTTLE_REGISTER", default="5/hour"),
    },
}

# ── JWT ───────────────────────────────────────────────────────────────────────
from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173"],
)
CORS_ALLOW_CREDENTIALS = True

# ── Celery ────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Africa/Nairobi"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
# DatabaseScheduler copies these into its tables when beat starts; times are
# CELERY_TIMEZONE (Nairobi).
CELERY_BEAT_SCHEDULE = {
    "expire-trials": {
        "task": "apps.billing.tasks.expire_trials",
        "schedule": crontab(hour=0, minute=5),
    },
    "expire-subscriptions": {
        "task": "apps.billing.tasks.expire_subscriptions",
        "schedule": crontab(hour=0, minute=10),
    },
    "mark-overdue-invoices": {
        "task": "apps.invoices.tasks.mark_overdue_invoices",
        "schedule": crontab(hour=6, minute=0),
    },
    "send-filing-reminders": {
        "task": "apps.taxes.tasks.send_filing_reminders",
        "schedule": crontab(hour=8, minute=0),
    },
}

# ── Internationalisation ──────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Nairobi"
USE_I18N = True
USE_TZ = True

# ── Static / Media ────────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── Email ─────────────────────────────────────────────────────────────────────
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Hesabu <noreply@hesabu.co.ke>")

# ── External Services ─────────────────────────────────────────────────────────
ETIMS_BASE_URL = env("ETIMS_BASE_URL", default="https://etims-sbx.kra.go.ke/etims-api")
ETIMS_PIN = env("ETIMS_PIN", default="")

# Web Push (VAPID). Empty keys disable push delivery; in-app notifications
# still work. Generate with: python manage.py generate_vapid_keys
VAPID_PUBLIC_KEY = env("VAPID_PUBLIC_KEY", default="")
VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY", default="")
VAPID_SUBJECT = env("VAPID_SUBJECT", default="mailto:support@hesabu.co.ke")

DARAJA_BASE_URL = env("DARAJA_BASE_URL", default="https://sandbox.safaricom.co.ke")
DARAJA_CONSUMER_KEY = env("DARAJA_CONSUMER_KEY", default="")
DARAJA_CONSUMER_SECRET = env("DARAJA_CONSUMER_SECRET", default="")
DARAJA_SHORTCODE = env("DARAJA_SHORTCODE", default="174379")
DARAJA_PASSKEY = env("DARAJA_PASSKEY", default="")
DARAJA_CALLBACK_URL     = env("DARAJA_CALLBACK_URL",     default="")
DARAJA_STK_CALLBACK_URL = env("DARAJA_STK_CALLBACK_URL", default="")

# Source-IP allowlist for the unauthenticated M-Pesa callback endpoints.
# List of IPs / CIDRs (Safaricom's published callback ranges). Empty = check
# disabled (dev/sandbox). DARAJA_TRUST_FORWARDED_FOR must be True when a
# reverse proxy (Caddy/nginx) fronts the app so the real client IP is read
# from X-Forwarded-For.
DARAJA_ALLOWED_IPS = env.list("DARAJA_ALLOWED_IPS", default=[])
DARAJA_TRUST_FORWARDED_FOR = env.bool("DARAJA_TRUST_FORWARDED_FOR", default=False)

# ── Stripe ─────────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY      = env("STRIPE_SECRET_KEY",      default="")
STRIPE_PUBLISHABLE_KEY = env("STRIPE_PUBLISHABLE_KEY", default="")
STRIPE_WEBHOOK_SECRET  = env("STRIPE_WEBHOOK_SECRET",  default="")

AT_USERNAME = env("AT_USERNAME", default="sandbox")
AT_API_KEY = env("AT_API_KEY", default="")
AT_SENDER_ID = env("AT_SENDER_ID", default="HESABU")

FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173")
