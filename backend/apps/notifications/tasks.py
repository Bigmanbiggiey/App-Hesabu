import json
import logging

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)

# Push services drop a message they can't deliver within this many seconds.
PUSH_TTL_SECONDS = 24 * 60 * 60


@shared_task
def send_push_notifications(notification_ids: list[str]):
    """Push each notification to every device its recipient enabled push on."""
    from pywebpush import WebPushException, webpush

    from .models import Notification, NotificationPreference, PushSubscription

    if not (settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY):
        logger.warning("VAPID keys not configured; skipping push delivery.")
        return 0

    sent = 0
    notifications = Notification.objects.filter(id__in=notification_ids).select_related(
        "user"
    )
    for notification in notifications:
        prefs = NotificationPreference.objects.filter(user=notification.user).first()
        if prefs and not prefs.wants_push(notification.kind):
            continue
        payload = json.dumps(
            {
                "title": notification.title,
                "body": notification.body,
                "url": notification.url or "/",
                "id": str(notification.id),
                # Same tag replaces an earlier notification of that kind on the device.
                "tag": notification.kind,
            }
        )
        for sub in PushSubscription.objects.filter(user=notification.user):
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": settings.VAPID_SUBJECT},
                    ttl=PUSH_TTL_SECONDS,
                )
                sent += 1
            except WebPushException as exc:
                status = getattr(exc.response, "status_code", None)
                if status in (404, 410):
                    # The browser unsubscribed or the subscription expired.
                    sub.delete()
                else:
                    logger.warning(f"Push to {sub.id} failed ({status}): {exc}")
            except Exception:
                # Malformed keys (client-supplied) or an unreachable push
                # service: skip this device, keep delivering to the rest.
                logger.exception(f"Push to {sub.id} failed")
    return sent
