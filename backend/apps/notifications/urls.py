from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()  # no API-root view competing with the list at ""
router.register("", views.NotificationViewSet, basename="notification")

urlpatterns = [
    path("push/key/", views.vapid_public_key, name="push-key"),
    path("push/subscription/", views.push_subscription, name="push-subscription"),
    path("preferences/", views.preferences, name="notification-preferences"),
    path("test/", views.send_test, name="notification-test"),
]

urlpatterns += router.urls
