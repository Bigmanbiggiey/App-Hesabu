from rest_framework import serializers
from .models import MpesaTransaction, Payment


class MpesaTransactionSerializer(serializers.ModelSerializer):
    payer_name = serializers.CharField(read_only=True)
    invoice_number = serializers.SerializerMethodField()

    class Meta:
        model = MpesaTransaction
        fields = [
            "id", "mpesa_receipt_number", "amount", "msisdn",
            "payer_name", "bill_ref_number", "transaction_time",
            "reconciliation_status", "invoice", "invoice_number", "created_at",
        ]
        read_only_fields = [
            "id", "mpesa_receipt_number", "amount", "msisdn",
            "transaction_time", "created_at",
        ]

    def get_invoice_number(self, obj):
        return obj.invoice.invoice_number if obj.invoice_id else None


class PaymentSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    customer_name = serializers.CharField(source="invoice.customer_name", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "invoice", "invoice_number", "customer_name", "amount",
            "payment_date", "payment_method", "reference",
            "mpesa_transaction", "notes", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def _request_org(self):
        request = self.context.get("request")
        return getattr(request, "organization", None)

    def validate_invoice(self, invoice):
        """Reject payments against an invoice belonging to another organisation."""
        org = self._request_org()
        if org is not None and invoice.organization_id != org.id:
            raise serializers.ValidationError("Invoice not found.")
        return invoice

    def validate_mpesa_transaction(self, txn):
        if txn is None:
            return txn
        org = self._request_org()
        if org is not None and txn.organization_id != org.id:
            raise serializers.ValidationError("M-Pesa transaction not found.")
        return txn

    def create(self, validated_data):
        validated_data["organization"] = self.context["request"].organization
        return super().create(validated_data)


class DarajaC2BCallbackSerializer(serializers.Serializer):
    """Validates the incoming Safaricom Daraja C2B webhook payload."""

    TransactionType = serializers.CharField()
    TransID = serializers.CharField()
    TransTime = serializers.CharField()
    TransAmount = serializers.CharField()
    BusinessShortCode = serializers.CharField()
    BillRefNumber = serializers.CharField(allow_blank=True, default="")
    InvoiceNumber = serializers.CharField(allow_blank=True, default="")
    OrgAccountBalance = serializers.CharField(allow_blank=True, default="")
    ThirdPartyTransID = serializers.CharField(allow_blank=True, default="")
    MSISDN = serializers.CharField()
    FirstName = serializers.CharField(allow_blank=True, default="")
    MiddleName = serializers.CharField(allow_blank=True, default="")
    LastName = serializers.CharField(allow_blank=True, default="")
