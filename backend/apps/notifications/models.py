from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class NotificationKind(models.TextChoices):
    PAYMENT_RECEIVED = "payment_received", "M-Pesa payment received"
    ETIMS_REJECTED = "etims_rejected", "eTIMS submission rejected"
    INVOICES_OVERDUE = "invoices_overdue", "Invoices overdue"
    FILING_REMINDER = "filing_reminder", "Tax filing reminder"
    TEST = "test", "Test notification"


class Notification(BaseModel):
    """
    One in-app notification for one user (the bell list). Push is a delivery
    channel on top: see apps.notifications.tasks.send_push_notifications.

    title/body may be shown on a locked phone screen, so they carry amounts
    and invoice numbers but never customer or payer names.
    """

    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.CASCADE, related_name="notifications"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField(max_length=30, choices=NotificationKind.choices)
    title = models.CharField(max_length=120)
    body = models.CharField(max_length=255)
    # In-app path to open, e.g. /invoices/<id>
    url = models.CharField(max_length=200, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "read_at"])]

    def __str__(self):
        return f"{self.user} — {self.title}"


class PushSubscription(BaseModel):
    """A browser/device the user enabled push on (Web Push API subscription)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "push_subscriptions"

    def __str__(self):
        return f"{self.user} — {self.endpoint[:40]}…"


class NotificationPreference(BaseModel):
    """
    Which notification kinds a user wants pushed to their devices. Every
    kind is still recorded in the in-app list; these only gate push.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    payment_received = models.BooleanField(default=True)
    etims_rejected = models.BooleanField(default=True)
    invoices_overdue = models.BooleanField(default=True)
    filing_reminder = models.BooleanField(default=True)

    class Meta:
        db_table = "notification_preferences"

    def wants_push(self, kind: str) -> bool:
        # Kinds without a toggle (e.g. "test") are always pushed.
        return getattr(self, kind, True)
