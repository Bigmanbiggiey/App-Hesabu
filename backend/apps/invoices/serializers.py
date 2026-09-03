from django.db import transaction
from rest_framework import serializers
from .models import Customer, Invoice, InvoiceLineItem


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id", "name", "kra_pin", "is_wht_agent",
            "email", "phone", "address", "notes", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = [
            "id", "description", "commodity_code",
            "quantity", "unit_price", "vat_class",
            "vat_rate", "line_total", "vat_amount",
        ]
        read_only_fields = ["id", "vat_rate", "line_total", "vat_amount"]


class InvoiceSerializer(serializers.ModelSerializer):
    line_items = InvoiceLineItemSerializer(many=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_kra_pin = serializers.CharField(source="customer.kra_pin", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_number", "customer", "customer_name", "customer_kra_pin",
            "invoice_date", "due_date", "status", "currency",
            "subtotal", "vat_amount", "wht_amount", "total_amount",
            "amount_paid", "amount_due", "notes", "terms",
            "etims_status", "etims_cu_serial_no", "etims_qr_code",
            "etims_submitted_at", "line_items", "created_at",
        ]
        read_only_fields = [
            "id", "invoice_number", "subtotal", "vat_amount",
            "total_amount", "amount_paid", "amount_due",
            "etims_status", "etims_cu_serial_no", "etims_qr_code",
            "etims_submitted_at", "created_at",
        ]

    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop("line_items")
        organization = self.context["request"].organization
        validated_data["invoice_number"] = organization.next_invoice_number()
        invoice = Invoice.objects.create(organization=organization, **validated_data)
        for item_data in line_items_data:
            InvoiceLineItem.objects.create(invoice=invoice, **item_data)
        invoice.recalculate_totals()
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        line_items_data = validated_data.pop("line_items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if line_items_data is not None:
            instance.line_items.all().delete()
            for item_data in line_items_data:
                InvoiceLineItem.objects.create(invoice=instance, **item_data)
            instance.recalculate_totals()
        return instance


class InvoiceListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""

    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_number", "customer_name",
            "invoice_date", "due_date", "status",
            "total_amount", "amount_due", "etims_status",
        ]
