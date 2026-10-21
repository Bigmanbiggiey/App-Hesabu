from django.conf import settings
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .models import (
    Notification,
    NotificationKind,
    NotificationPreference,
    PushSubscription,
)
from .serializers import (
    NotificationPreferenceSerializer,
    NotificationSerializer,
    PushSubscriptionSerializer,
)
from .services import notify


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """The signed-in user's own notifications, newest first."""

    serializer_class = NotificationSerializer
    lookup_value_regex = (
        "[0-9a-f-]{36}"  # a malformed id 404s instead of erroring in the UUID lookup
    )

    def get_queryset(self):
        return Notification.objects.filter(
            user=self.request.user, organization=self.request.organization
        )

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response(
            {"count": self.get_queryset().filter(read_at__isnull=True).count()}
        )

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        updated = (
            self.get_queryset()
            .filter(pk=pk, read_at__isnull=True)
            .update(read_at=timezone.now())
        )
        if not updated and not self.get_queryset().filter(pk=pk).exists():
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
def vapid_public_key(request):
    """The key the browser needs to subscribe; empty when push isn't configured."""
    return Response({"public_key": settings.VAPID_PUBLIC_KEY})


@api_view(["POST", "DELETE"])
def push_subscription(request):
    serializer = PushSubscriptionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    endpoint = serializer.validated_data["endpoint"]

    if request.method == "DELETE":
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    keys = serializer.validated_data["keys"]
    # Upsert by endpoint: a device belongs to whoever subscribed it last, so a
    # shared device stops receiving the previous user's notifications.
    PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            "user": request.user,
            "p256dh": keys["p256dh"],
            "auth": keys["auth"],
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
        },
    )
    return Response(status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
def preferences(request):
    prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
    if request.method == "GET":
        return Response(NotificationPreferenceSerializer(prefs).data)
    serializer = NotificationPreferenceSerializer(
        prefs, data=request.data, partial=True
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["POST"])
def send_test(request):
    """Send the caller a test notification (in-app + their push devices)."""
    notify(
        request.organization,
        NotificationKind.TEST,
        "Notifications are on",
        "This is a test notification from Hesabu.",
        url="/settings",
        users=[request.user],
    )
    return Response(status=status.HTTP_202_ACCEPTED)
