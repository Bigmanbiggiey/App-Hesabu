from django.contrib import admin
from .models import MpesaTransaction, Payment


@admin.register(MpesaTransaction)
class MpesaTransactionAdmin(admin.ModelAdmin):
    list_display = [
        "mpesa_receipt_number", "amount", "msisdn",
        "transaction_time", "reconciliation_status", "invoice",
    ]
    list_filter = ["reconciliation_status", "organization"]
    search_fields = ["mpesa_receipt_number", "msisdn", "bill_ref_number"]
    readonly_fields = ["raw_payload"]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["invoice", "amount", "payment_date", "payment_method", "reference"]
    list_filter = ["payment_method", "organization"]
    search_fields = ["reference", "invoice__invoice_number"]
