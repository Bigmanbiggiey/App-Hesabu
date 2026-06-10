from .base import *  # noqa

DEBUG = True

INSTALLED_APPS += ["debug_toolbar"]  # noqa: F405

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
