from rest_framework import serializers
from .models import BillingTransaction
from .limits import TIER_LIMITS


class MpesaInitiateSerializer(serializers.Serializer):
    plan  = serializers.ChoiceField(choices=list(TIER_LIMITS.keys()))
    phone = serializers.CharField(max_length=20)

    def validate_phone(self, value):
        cleaned = value.strip().replace(" ", "").replace("-", "")
        if not (cleaned.startswith(("07", "01", "+2547", "+2541", "2547", "2541"))
                or (cleaned.startswith("254") and len(cleaned) == 12)):
            raise serializers.ValidationError("Enter a valid Kenyan phone number.")
        return cleaned


class StripeCheckoutSerializer(serializers.Serializer):
    plan = serializers.ChoiceField(choices=list(TIER_LIMITS.keys()))


class BillingTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = BillingTransaction
        fields = [
            "id", "amount", "currency", "payment_gateway",
            "gateway_reference", "status", "plan_tier",
            "billing_period_start", "billing_period_end", "created_at",
        ]
        read_only_fields = fields
