from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # Features
    path("api/v1/invoices/", include("apps.invoices.urls")),
    path("api/v1/payments/", include("apps.payments.urls")),
    path("api/v1/taxes/",   include("apps.taxes.urls")),
    path("api/v1/billing/", include("apps.billing.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
