import logging
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

import stripe
from django.conf import settings
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Organization, SubscriptionStatus, SubscriptionTier
from apps.core.decorators import daraja_ip_allowlist
from apps.core.pagination import StandardPagination
from apps.core.permissions import IsOwnerOrAdmin

from .daraja import DarajaSTKClient
from .limits import TIER_LIMITS, get_limits
from .models import BillingStatus, BillingTransaction, PaymentGateway
from .serializers import (
    BillingTransactionSerializer,
    MpesaInitiateSerializer,
    StripeCheckoutSerializer,
)
from .stripe_client import create_checkout_session

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _activate_subscription(org: Organization, plan_tier: str) -> None:
    """Set org subscription to active for 30 days on successful payment."""
    today = date.today()
    org.subscription_tier    = plan_tier
    org.subscription_status  = SubscriptionStatus.ACTIVE
    org.subscription_ends_at = timezone.make_aware(
        timezone.datetime.combine(today + timedelta(days=30), timezone.datetime.min.time())
    )
    org.save(update_fields=["subscription_tier", "subscription_status", "subscription_ends_at"])

    # SMS confirmation to org owner
    from apps.accounts.models import User
    from apps.core.sms import send_sms
    owner = User.objects.filter(organization=org, role__in=["owner", "admin"]).first()
    if owner and owner.phone_number:
        phone = owner.phone_number if owner.phone_number.startswith("+") else f"+{owner.phone_number}"
        tier_display = plan_tier.capitalize()
        ends = (today + timedelta(days=30)).strftime("%d %b %Y")
        send_sms(phone, f"Hesabu: {tier_display} subscription activated. Valid until {ends}.")


# ── Billing Status ─────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def billing_status(request):
    """
    GET /api/v1/billing/status/
    Returns current subscription state + usage stats for this month.
    """
    org = request.organization
    now = timezone.now()

    from apps.invoices.models import Invoice
    from apps.accounts.models import User

    invoices_this_month = Invoice.objects.filter(
        organization=org,
        created_at__year=now.year,
        created_at__month=now.month,
    ).count()
    active_users = User.objects.filter(organization=org, is_active=True).count()

    limits = get_limits(org.subscription_tier)

    return Response({
        "subscription_tier":    org.subscription_tier,
        "subscription_status":  org.subscription_status,
        "trial_ends_at":        org.trial_ends_at,
        "subscription_ends_at": org.subscription_ends_at,
        "usage": {
            "invoices_this_month": invoices_this_month,
            "invoices_limit":      limits["invoices_per_month"],
            "users":               active_users,
            "users_limit":         limits["users"],
        },
    })


# ── M-Pesa STK Push ───────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mpesa_initiate(request):
    """
    POST /api/v1/billing/mpesa/initiate/
    Body: {"plan": "kampuni", "phone": "0712345678"}

    Initiates a Daraja STK Push and creates a PENDING BillingTransaction.
    The frontend should poll /billing/status/ after calling this.
    """
    serializer = MpesaInitiateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    plan  = serializer.validated_data["plan"]
    phone = serializer.validated_data["phone"]
    org   = request.organization
    amount = TIER_LIMITS[plan]["price_kes"]

    client = DarajaSTKClient()
    try:
        result = client.stk_push(
            phone=phone,
            amount=amount,
            account_ref=f"HSB-{plan.upper()}",
        )
    except Exception as exc:
        logger.error(f"STK Push failed for org {org.id}: {exc}")
        return Response(
            {"detail": "Failed to initiate M-Pesa payment. Please try again."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    if str(result.get("ResponseCode", "1")) != "0":
        return Response(
            {"detail": result.get("ResponseDescription", "M-Pesa request rejected.")},
            status=status.HTTP_400_BAD_REQUEST,
        )

    checkout_request_id = result["CheckoutRequestID"]

    BillingTransaction.objects.create(
        organization=org,
        amount=amount,
        currency="KES",
        payment_gateway=PaymentGateway.MPESA,
        mpesa_checkout_request_id=checkout_request_id,
        status=BillingStatus.PENDING,
        plan_tier=plan,
        raw_payload=result,
    )

    return Response({
        "checkout_request_id": checkout_request_id,
        "message": "Check your phone — enter your M-Pesa PIN to complete payment.",
    })


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
@daraja_ip_allowlist
def mpesa_callback(request):
    """
    POST /api/v1/billing/mpesa/callback/
    Daraja STK Push result callback. Unauthenticated (Safaricom calls it) so
    protected by the DARAJA_ALLOWED_IPS source-IP allowlist; the paid amount
    is checked against the pending BillingTransaction before activation.
    """
    payload = request.data
    logger.info(f"STK callback received: {payload}")

    try:
        body      = payload.get("Body", {})
        stk_cb    = body.get("stkCallback", {})
        result_code = stk_cb.get("ResultCode")
        checkout_id = stk_cb.get("CheckoutRequestID", "")

        txn = BillingTransaction.objects.select_related("organization").filter(
            mpesa_checkout_request_id=checkout_id
        ).first()

        if not txn:
            logger.warning(f"STK callback: no BillingTransaction found for {checkout_id}")
            return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

        if result_code == 0:
            # Payment successful — extract receipt number + amount from metadata
            items = stk_cb.get("CallbackMetadata", {}).get("Item", [])
            receipt = next(
                (i["Value"] for i in items if i.get("Name") == "MpesaReceiptNumber"),
                "",
            )
            paid_raw = next(
                (i["Value"] for i in items if i.get("Name") == "Amount"), None
            )

            # Never activate on a mismatched (or unparseable) amount.
            try:
                paid_amount = Decimal(str(paid_raw))
            except (InvalidOperation, TypeError):
                paid_amount = None

            if paid_amount is None or paid_amount != txn.amount:
                txn.status = BillingStatus.FAILED
                txn.raw_payload = payload
                txn.save(update_fields=["status", "raw_payload"])
                logger.error(
                    "STK callback amount mismatch for %s: got %r, expected %s — "
                    "not activating.",
                    checkout_id, paid_raw, txn.amount,
                )
                return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

            txn.status            = BillingStatus.SUCCESS
            txn.gateway_reference = receipt
            txn.billing_period_start = date.today()
            txn.billing_period_end   = date.today() + timedelta(days=30)
            txn.raw_payload = payload
            txn.save()

            _activate_subscription(txn.organization, txn.plan_tier)
            logger.info(f"STK success: org {txn.organization_id} activated on {txn.plan_tier}")
        else:
            txn.status = BillingStatus.FAILED
            txn.raw_payload = payload
            txn.save(update_fields=["status", "raw_payload"])
            logger.info(f"STK failed (code {result_code}) for checkout {checkout_id}")

    except Exception as exc:
        logger.error(f"STK callback processing error: {exc}", exc_info=True)

    # Always return 200 to Daraja
    return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


# ── Stripe ────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def stripe_checkout(request):
    """
    POST /api/v1/billing/stripe/checkout/
    Body: {"plan": "kampuni"}
    Returns: {"url": "https://checkout.stripe.com/..."}
    """
    serializer = StripeCheckoutSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    plan = serializer.validated_data["plan"]
    org  = request.organization
    frontend_url = settings.FRONTEND_URL.rstrip("/")

    try:
        url = create_checkout_session(
            org=org,
            plan_tier=plan,
            success_url=f"{frontend_url}/settings?tab=billing&payment=success",
            cancel_url=f"{frontend_url}/settings?tab=billing&payment=cancelled",
        )
    except stripe.error.StripeError as exc:
        logger.error(f"Stripe checkout error for org {org.id}: {exc}")
        return Response(
            {"detail": "Failed to create Stripe checkout session. Please try again."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    # Pre-create a PENDING transaction (will be confirmed via webhook)
    BillingTransaction.objects.create(
        organization=org,
        amount=TIER_LIMITS[plan]["price_kes"],
        currency="KES",
        payment_gateway=PaymentGateway.STRIPE,
        status=BillingStatus.PENDING,
        plan_tier=plan,
    )

    return Response({"url": url})


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def stripe_webhook(request):
    """
    POST /api/v1/billing/stripe/webhook/
    Stripe webhook — verifies signature, handles checkout.session.completed
    and invoice.payment_failed events.
    """
    payload    = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        logger.warning(f"Stripe webhook signature invalid: {exc}")
        return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)

    event_type = event["type"]
    data_obj   = event["data"]["object"]

    if event_type == "checkout.session.completed":
        org_id    = data_obj.get("metadata", {}).get("org_id")
        plan_tier = data_obj.get("metadata", {}).get("plan_tier")
        payment_intent = data_obj.get("payment_intent", "")

        try:
            org = Organization.objects.get(id=org_id)
        except Organization.DoesNotExist:
            logger.error(f"Stripe webhook: org {org_id} not found")
            return Response(status=status.HTTP_200_OK)

        # Mark the most recent pending Stripe txn for this org as succeeded
        txn = BillingTransaction.objects.filter(
            organization=org,
            payment_gateway=PaymentGateway.STRIPE,
            plan_tier=plan_tier,
            status=BillingStatus.PENDING,
        ).order_by("-created_at").first()

        if txn:
            txn.status            = BillingStatus.SUCCESS
            txn.gateway_reference = payment_intent
            txn.billing_period_start = date.today()
            txn.billing_period_end   = date.today() + timedelta(days=30)
            txn.raw_payload = dict(event)
            txn.save()

        _activate_subscription(org, plan_tier)
        logger.info(f"Stripe checkout.session.completed: org {org_id} → {plan_tier}")

    elif event_type == "invoice.payment_failed":
        customer_email = data_obj.get("customer_email", "")
        logger.warning(f"Stripe invoice.payment_failed for {customer_email}: {data_obj.get('id')}")
        # Mark subscription past_due for the linked org
        org_id = data_obj.get("metadata", {}).get("org_id")
        if org_id:
            try:
                org = Organization.objects.get(id=org_id)
                org.subscription_status = SubscriptionStatus.PAST_DUE
                org.save(update_fields=["subscription_status"])
                logger.info(f"Org {org_id} marked past_due after Stripe payment failure")
            except Organization.DoesNotExist:
                logger.error(f"Stripe payment_failed: org {org_id} not found")

    return Response(status=status.HTTP_200_OK)


# ── Cancel ────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsOwnerOrAdmin])
def cancel_subscription(request):
    """
    POST /api/v1/billing/cancel/
    Cancels the active subscription. Owner/admin-only.
    """
    org = request.organization
    org.subscription_status = SubscriptionStatus.CANCELLED
    org.save(update_fields=["subscription_status"])

    return Response({
        "subscription_status": org.subscription_status,
        "message": "Your subscription has been cancelled.",
    })


# ── History ───────────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def billing_history(request):
    """
    GET /api/v1/billing/history/
    Paginated list of billing transactions for this organisation.
    """
    qs = BillingTransaction.objects.filter(
        organization=request.organization
    ).order_by("-created_at")

    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    serializer = BillingTransactionSerializer(page, many=True)
    return paginator.get_paginated_response(serializer.data)
