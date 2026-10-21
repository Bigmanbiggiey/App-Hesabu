from django.contrib import admin

from .models import Notification, NotificationPreference, PushSubscription


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["title", "kind", "user", "organization", "read_at", "created_at"]
    list_filter = ["kind"]


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ["user", "user_agent", "created_at"]


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = [
        "user",
        "payment_received",
        "etims_rejected",
        "invoices_overdue",
        "filing_reminder",
    ]
