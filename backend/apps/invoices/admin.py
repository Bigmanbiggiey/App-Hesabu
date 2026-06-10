from django.contrib import admin
from .models import Customer, Invoice, InvoiceLineItem


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 0
    readonly_fields = ["line_total", "vat_amount"]


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["name", "kra_pin", "is_wht_agent", "organization", "email"]
    search_fields = ["name", "kra_pin"]
    list_filter = ["is_wht_agent", "organization"]


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = [
        "invoice_number", "customer", "organization",
        "invoice_date", "total_amount", "status", "etims_status",
    ]
    search_fields = ["invoice_number", "customer__name"]
    list_filter = ["status", "etims_status", "organization"]
    readonly_fields = [
        "invoice_number", "subtotal", "vat_amount", "total_amount",
        "amount_paid", "amount_due", "etims_cu_serial_no", "etims_qr_code",
        "etims_submitted_at", "etims_response",
    ]
    inlines = [InvoiceLineItemInline]
