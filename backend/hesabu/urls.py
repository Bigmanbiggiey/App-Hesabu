from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from apps.accounts.views import HesabuTokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth
    path("api/v1/auth/", include("apps.accounts.urls")),
    path(
        "api/v1/auth/token/refresh/",
        HesabuTokenRefreshView.as_view(),
        name="token_refresh",
    ),
    # Features
    path("api/v1/invoices/", include("apps.invoices.urls")),
    path("api/v1/payments/", include("apps.payments.urls")),
    path("api/v1/taxes/",   include("apps.taxes.urls")),
    path("api/v1/billing/", include("apps.billing.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
]

# django.conf.urls.static.static() is a no-op when DEBUG is False; in
# production nginx serves /media/ directly from the shared volume.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

    if "debug_toolbar" in settings.INSTALLED_APPS:
        urlpatterns += [path("__debug__/", include("debug_toolbar.urls"))]
