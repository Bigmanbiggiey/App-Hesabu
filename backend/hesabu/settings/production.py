from .base import *  # noqa

DEBUG = False

# ── Required configuration ───────────────────────────────────────────────────
# No defaults: django-environ raises ImproperlyConfigured at import time if
# any of these are missing from the environment, so a misconfigured container
# fails to boot instead of coming up wide open (ALLOWED_HOSTS=[] etc.).
# SECRET_KEY / DB_PASSWORD are already default-less in base.py.
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS")

# ── Security ──────────────────────────────────────────────────────────────────
# Caddy terminates TLS and proxies plain HTTP to this container.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
X_FRAME_OPTIONS = "DENY"

# Caddy terminates TLS and sets X-Forwarded-For, so the M-Pesa callback IP
# allowlist must read the client IP from that header.
DARAJA_TRUST_FORWARDED_FOR = env.bool("DARAJA_TRUST_FORWARDED_FOR", default=True)

# ── Static files ──────────────────────────────────────────────────────────────
# nginx serves /media/ directly (django.conf.urls.static.static() is a no-op
# once DEBUG=False); whitenoise serves /static/ from inside gunicorn, reached
# through nginx's /static/ proxy block (mainly for Django admin's own assets).
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.OrganizationMiddleware",
]

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}
