from rest_framework import serializers

from .models import Notification, NotificationPreference


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "url", "read_at", "created_at"]
        read_only_fields = fields


class PushSubscriptionSerializer(serializers.Serializer):
    """The browser's PushSubscription.toJSON() shape."""

    endpoint = serializers.URLField(max_length=500)
    keys = serializers.DictField(child=serializers.CharField(max_length=200))

    def validate_keys(self, keys):
        if not keys.get("p256dh") or not keys.get("auth"):
            raise serializers.ValidationError("p256dh and auth keys are required.")
        return keys


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "payment_received",
            "etims_rejected",
            "invoices_overdue",
            "filing_reminder",
        ]
