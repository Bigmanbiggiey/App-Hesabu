from django.db import models
from django.core.exceptions import ValidationError
from apps.core.models import BaseModel


class VATClass(models.TextChoices):
    STANDARD = "standard", "Standard (16%)"
    ZERO_RATED = "zero_rated", "Zero Rated (0%)"
    EXEMPT = "exempt", "Exempt"


class EtimsStatus(models.TextChoices):
    PENDING = "pending", "Pending Submission"
    QUEUED = "queued", "Queued"
    SUBMITTED = "submitted", "Submitted to KRA"
    ACCEPTED = "accepted", "Accepted by KRA"
    REJECTED = "rejected", "Rejected by KRA"
    NOT_APPLICABLE = "na", "Not Applicable"


class InvoiceStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SENT = "sent", "Sent"
    PARTIAL = "partial", "Partially Paid"
    PAID = "paid", "Paid"
    OVERDUE = "overdue", "Overdue"
    CANCELLED = "cancelled", "Cancelled"


class Customer(BaseModel):
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.CASCADE, related_name="customers"
    )
    name = models.CharField(max_length=255)
    kra_pin = models.CharField(max_length=11, blank=True)
    is_wht_agent = models.BooleanField(
        default=False,
        help_text="Is this customer a registered Withholding Tax agent?",
    )
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "customers"
        ordering = ["name"]
        unique_together = [["organization", "kra_pin"]]

    def __str__(self):
        return self.name


class Invoice(BaseModel):
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.CASCADE, related_name="invoices"
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name="invoices"
    )
    invoice_number = models.CharField(max_length=30)
    invoice_date = models.DateField()
    due_date = models.DateField()
    status = models.CharField(
        max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.DRAFT
    )
    currency = models.CharField(max_length=3, default="KES")

    # Financials
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    vat_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    wht_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        help_text="Withholding Tax deducted by customer",
    )
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_due = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)

    # eTIMS fields — immutable state machine (enforced by DB trigger via migration)
    etims_status = models.CharField(
        max_length=20, choices=EtimsStatus.choices, default=EtimsStatus.PENDING
    )
    etims_cu_serial_no = models.CharField(max_length=100, blank=True)
    etims_receipt_number = models.CharField(max_length=100, blank=True)
    etims_qr_code = models.TextField(blank=True)
    etims_submitted_at = models.DateTimeField(null=True, blank=True)
    etims_response = models.JSONField(null=True, blank=True)

    # Tax period lock reference
    tax_period = models.ForeignKey(
        "taxes.TaxPeriod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )

    class Meta:
        db_table = "invoices"
        ordering = ["-invoice_date", "-created_at"]
        unique_together = [["organization", "invoice_number"]]

    def __str__(self):
        return f"{self.invoice_number} — {self.customer.name}"

    def recalculate_totals(self):
        items = self.line_items.all()
        self.subtotal = sum(item.line_total for item in items)
        self.vat_amount = sum(item.vat_amount for item in items)
        self.total_amount = self.subtotal + self.vat_amount - self.wht_amount
        self.amount_due = self.total_amount - self.amount_paid
        self.save(update_fields=["subtotal", "vat_amount", "total_amount", "amount_due"])


class InvoiceLineItem(BaseModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    description = models.CharField(max_length=500)
    commodity_code = models.CharField(
        max_length=10,
        blank=True,
        help_text="KRA commodity classification code",
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=4)
    unit_price = models.DecimalField(max_digits=14, decimal_places=2)
    vat_class = models.CharField(
        max_length=20, choices=VATClass.choices, default=VATClass.STANDARD
    )
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=16.00)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    vat_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        db_table = "invoice_line_items"
        ordering = ["created_at"]

    def save(self, *args, **kwargs):
        self.line_total = self.quantity * self.unit_price
        if self.vat_class == VATClass.STANDARD:
            self.vat_rate = 16.00
            self.vat_amount = self.line_total * (self.vat_rate / 100)
        else:
            self.vat_rate = 0
            self.vat_amount = 0
        super().save(*args, **kwargs)
