"""
Stripe Checkout Session helper for Hesabu subscription billing.

Flow:
1. Call create_checkout_session() → returns a Stripe-hosted checkout URL
2. Frontend redirects the user to that URL
3. User pays with card on Stripe's hosted page
4. On success, Stripe calls /api/v1/billing/stripe/webhook/ with
   checkout.session.completed
5. Webhook handler activates the subscription on the Organisation.
"""
import logging

import stripe
from django.conf import settings

from .limits import TIER_LIMITS

logger = logging.getLogger(__name__)


def create_checkout_session(org, plan_tier: str, success_url: str, cancel_url: str) -> str:
    """
    Create a Stripe Checkout Session for a one-time subscription payment.

    Returns the Stripe-hosted checkout URL the frontend should redirect to.
    Raises stripe.error.StripeError on API failures.
    """
    stripe.api_key = settings.STRIPE_SECRET_KEY

    price_kes = TIER_LIMITS[plan_tier]["price_kes"]

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "kes",
                    "unit_amount": price_kes * 100,  # Stripe uses smallest currency unit
                    "product_data": {
                        "name": f"Hesabu {plan_tier.title()} Plan",
                        "description": "Monthly subscription — 30 days access",
                    },
                },
                "quantity": 1,
            }
        ],
        mode="payment",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "org_id":    str(org.id),
            "plan_tier": plan_tier,
        },
        customer_email=org.email or None,
    )
    logger.info(f"Stripe checkout session created: {session.id} for org {org.id}")
    return session.url
