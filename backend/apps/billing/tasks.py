import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def expire_trials():
    """
    Daily task: transition trial orgs to past_due when their trial period ends.
    Runs at midnight Africa/Nairobi via django-celery-beat.
    """
    from apps.accounts.models import Organization, SubscriptionStatus

    updated = Organization.objects.filter(
        subscription_status=SubscriptionStatus.TRIAL,
        trial_ends_at__lt=timezone.now(),
    ).update(subscription_status=SubscriptionStatus.PAST_DUE)

    logger.info(f"expire_trials: {updated} org(s) moved to past_due")
    return updated


@shared_task
def expire_subscriptions():
    """
    Daily task: transition active orgs to past_due when their paid
    subscription period ends.
    """
    from apps.accounts.models import Organization, SubscriptionStatus

    updated = Organization.objects.filter(
        subscription_status=SubscriptionStatus.ACTIVE,
        subscription_ends_at__lt=timezone.now(),
    ).update(subscription_status=SubscriptionStatus.PAST_DUE)

    logger.info(f"expire_subscriptions: {updated} org(s) moved to past_due")
    return updated
