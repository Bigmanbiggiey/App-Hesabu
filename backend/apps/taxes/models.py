from django.db import models
from django.core.exceptions import ValidationError
from apps.core.models import BaseModel


class PeriodType(models.TextChoices):
    VAT = "vat", "VAT Return"
    PAYE = "paye", "PAYE Return"


class PeriodStatus(models.TextChoices):
    OPEN = "open", "Open"
    CLOSED = "closed", "Closed"
    SUBMITTED = "submitted", "Submitted to iTax"


class TaxPeriod(BaseModel):
    """
    A tax filing period. Once locked, no invoices in that period can be modified.
    The lock is enforced by a PostgreSQL trigger created in the migration.
    """

    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.CASCADE, related_name="tax_periods"
    )
    period_type = models.CharField(max_length=10, choices=PeriodType.choices)
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=20, choices=PeriodStatus.choices, default=PeriodStatus.OPEN
    )
    locked_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    itax_submission_ref = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "tax_periods"
        unique_together = [["organization", "period_type", "year", "month"]]
        ordering = ["-year", "-month"]

    def __str__(self):
        return f"{self.organization.name} — {self.get_period_type_display()} {self.year}/{self.month:02d}"

    def lock(self):
        from django.utils import timezone
        self.status = PeriodStatus.CLOSED
        self.locked_at = timezone.now()
        self.save(update_fields=["status", "locked_at"])


class VATReturn(BaseModel):
    tax_period = models.OneToOneField(
        TaxPeriod, on_delete=models.CASCADE, related_name="vat_return"
    )
    output_vat = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text="VAT charged on sales (from eTIMS invoices)"
    )
    input_vat = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text="VAT paid on purchases (from supplier eTIMS invoices)"
    )
    net_vat_payable = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    return_data = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "vat_returns"

    def calculate(self):
        self.net_vat_payable = self.output_vat - self.input_vat
        self.save(update_fields=["net_vat_payable"])

    def __str__(self):
        return f"VAT Return — {self.tax_period}"


class NSSFRate(models.TextChoices):
    """NSSF contribution rates per Kenya NSSF Act 2013 (new rates)."""
    OLD = "old", "Old Rate (200/month)"
    NEW = "new", "New Rate (6% of gross)"


class Employee(BaseModel):
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.CASCADE, related_name="employees"
    )
    employee_number = models.CharField(max_length=20, blank=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    kra_pin = models.CharField(max_length=11, blank=True)
    nhif_number = models.CharField(max_length=20, blank=True)
    nssf_number = models.CharField(max_length=20, blank=True)
    id_number = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)

    # Payroll
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2)
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2)
    allowances = models.JSONField(
        default=dict,
        help_text="e.g. {'housing': 10000, 'transport': 5000}",
    )
    is_active = models.BooleanField(default=True)
    date_of_joining = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "employees"
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


class PAYEReturn(BaseModel):
    """Monthly PAYE calculation per employee."""

    tax_period = models.ForeignKey(
        TaxPeriod, on_delete=models.CASCADE, related_name="paye_returns"
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="paye_returns"
    )
    gross_pay = models.DecimalField(max_digits=12, decimal_places=2)
    taxable_income = models.DecimalField(max_digits=12, decimal_places=2)
    paye_deducted = models.DecimalField(max_digits=12, decimal_places=2)
    personal_relief = models.DecimalField(max_digits=10, decimal_places=2, default=2400)
    nhif_deduction = models.DecimalField(max_digits=10, decimal_places=2)
    nssf_deduction = models.DecimalField(max_digits=10, decimal_places=2)
    housing_levy = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "paye_returns"
        unique_together = [["tax_period", "employee"]]

    def __str__(self):
        return f"PAYE {self.employee} — {self.tax_period}"
