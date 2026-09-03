from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

# ── Tier definitions ──────────────────────────────────────────────────────────
# invoices_per_month: None = unlimited
# users: None = unlimited
TIER_LIMITS: dict[str, dict] = {
    "biashara": {"invoices_per_month": 100,  "users": 5,    "price_kes": 2500},
    "kampuni":  {"invoices_per_month": None, "users": 15,   "price_kes": 6500},
    "shirika":  {"invoices_per_month": None, "users": None, "price_kes": 15000},
}


def get_limits(tier: str) -> dict:
    return TIER_LIMITS.get(tier, TIER_LIMITS["biashara"])


def check_invoice_limit(org) -> None:
    """
    Raise PermissionDenied (HTTP 403) if the org has reached its monthly
    invoice creation cap for the current calendar month.
    """
    from apps.invoices.models import Invoice

    limits = get_limits(org.subscription_tier)
    cap = limits["invoices_per_month"]
    if cap is None:
        return  # unlimited tier

    # Count by invoice_date (not created_at) so an invoice always counts
    # toward the same month as the tax period it will fall into.
    now = timezone.now()
    count = Invoice.objects.filter(
        organization=org,
        invoice_date__year=now.year,
        invoice_date__month=now.month,
    ).count()

    if count >= cap:
        raise PermissionDenied(
            f"Your {org.subscription_tier.title()} plan allows {cap} invoices per month. "
            "Please upgrade your plan to create more invoices."
        )


def check_user_limit(org) -> None:
    """
    Raise PermissionDenied (HTTP 403) if the org has reached its active
    user seat cap.
    """
    from apps.accounts.models import User

    limits = get_limits(org.subscription_tier)
    cap = limits["users"]
    if cap is None:
        return  # unlimited tier

    count = User.objects.filter(organization=org, is_active=True).count()
    if count >= cap:
        raise PermissionDenied(
            f"Your {org.subscription_tier.title()} plan allows {cap} users. "
            "Please upgrade your plan to add more team members."
        )
