from django.db import models
from apps.core.models import BaseModel


class ReconciliationStatus(models.TextChoices):
    UNALLOCATED = "unallocated", "Unallocated"
    MATCHED = "matched", "Matched"
    PARTIAL = "partial", "Partial"
    MANUAL = "manual", "Manually Assigned"


class PaymentMethod(models.TextChoices):
    MPESA = "mpesa", "M-Pesa"
    BANK = "bank", "Bank Transfer"
    CASH = "cash", "Cash"
    CHEQUE = "cheque", "Cheque"
    OTHER = "other", "Other"


class MpesaTransaction(BaseModel):
    """Raw Daraja C2B webhook payload — never mutated after creation."""

    organization = models.ForeignKey(
        "accounts.Organization",
        on_delete=models.CASCADE,
        related_name="mpesa_transactions",
    )
    mpesa_receipt_number = models.CharField(max_length=30, unique=True)
    transaction_type = models.CharField(max_length=20, default="Pay Bill")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    msisdn = models.CharField(max_length=15, help_text="Payer phone number")
    first_name = models.CharField(max_length=100, blank=True)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    bill_ref_number = models.CharField(max_length=50, blank=True)
    business_short_code = models.CharField(max_length=10)
    transaction_time = models.DateTimeField()
    raw_payload = models.JSONField()
    reconciliation_status = models.CharField(
        max_length=20,
        choices=ReconciliationStatus.choices,
        default=ReconciliationStatus.UNALLOCATED,
        db_index=True,
    )
    invoice = models.ForeignKey(
        "invoices.Invoice",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mpesa_transactions",
    )

    class Meta:
        db_table = "mpesa_transactions"
        ordering = ["-transaction_time"]
        indexes = [
            models.Index(
                fields=["reconciliation_status"],
                condition=models.Q(reconciliation_status="unallocated"),
                name="idx_mpesa_unallocated",
            )
        ]

    def __str__(self):
        return f"{self.mpesa_receipt_number} — KES {self.amount} from {self.msisdn}"

    @property
    def payer_name(self):
        return " ".join(filter(None, [self.first_name, self.middle_name, self.last_name]))


class Payment(BaseModel):
    invoice = models.ForeignKey(
        "invoices.Invoice", on_delete=models.PROTECT, related_name="payments"
    )
    organization = models.ForeignKey(
        "accounts.Organization", on_delete=models.CASCADE, related_name="payments"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField()
    payment_method = models.CharField(
        max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.MPESA
    )
    reference = models.CharField(max_length=100, blank=True)
    mpesa_transaction = models.OneToOneField(
        MpesaTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment",
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "payments"
        ordering = ["-payment_date"]

    def __str__(self):
        return f"KES {self.amount} for {self.invoice.invoice_number}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Re-derive the invoice balance/status from all its payments.
        from apps.invoices.models import Invoice

        Invoice.objects.get(pk=self.invoice_id).reconcile_payments()
