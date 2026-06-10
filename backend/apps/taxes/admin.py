from django.contrib import admin
from .models import TaxPeriod, VATReturn, Employee, PAYEReturn


@admin.register(TaxPeriod)
class TaxPeriodAdmin(admin.ModelAdmin):
    list_display = ["organization", "period_type", "year", "month", "status", "locked_at"]
    list_filter = ["period_type", "status", "organization"]


@admin.register(VATReturn)
class VATReturnAdmin(admin.ModelAdmin):
    list_display = ["tax_period", "output_vat", "input_vat", "net_vat_payable"]
    readonly_fields = ["net_vat_payable"]


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ["full_name", "employee_number", "organization", "gross_salary", "is_active"]
    list_filter = ["is_active", "organization"]
    search_fields = ["first_name", "last_name", "kra_pin"]


@admin.register(PAYEReturn)
class PAYEReturnAdmin(admin.ModelAdmin):
    list_display = ["employee", "tax_period", "gross_pay", "paye_deducted", "net_pay"]
