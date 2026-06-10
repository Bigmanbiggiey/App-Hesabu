from django.db import models
from apps.core.models import BaseModel
from apps.accounts.models import Organization, SubscriptionTier


class PaymentGateway(models.TextChoices):
    MPESA  = "mpesa",  "M-Pesa STK Push"
    STRIPE = "stripe", "Stripe"


class BillingStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SUCCESS = "success", "Success"
    FAILED  = "failed",  "Failed"


class BillingTransaction(BaseModel):
    """
    Records every subscription payment attempt (M-Pesa STK Push or Stripe).
    Immutable audit trail — never delete, only update status.
    """
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="billing_transactions",
    )
    amount   = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="KES")

    payment_gateway = models.CharField(max_length=10, choices=PaymentGateway.choices)
    # Set after payment confirmed: M-Pesa receipt number OR Stripe payment_intent id
    gateway_reference = models.CharField(max_length=100, blank=True)
    # STK Push only — used to match the Daraja callback back to this record
    mpesa_checkout_request_id = models.CharField(max_length=100, blank=True, db_index=True)

    status    = models.CharField(max_length=10, choices=BillingStatus.choices, default=BillingStatus.PENDING)
    plan_tier = models.CharField(max_length=20, choices=SubscriptionTier.choices)

    billing_period_start = models.DateField(null=True, blank=True)
    billing_period_end   = models.DateField(null=True, blank=True)

    # Full webhook payload stored for audit / debugging
    raw_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "billing_transactions"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.organization} | {self.plan_tier} | {self.status} | {self.amount} {self.currency}"
