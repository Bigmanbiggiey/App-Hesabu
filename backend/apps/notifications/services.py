from django.db import transaction

from apps.core.permissions import FINANCE_ROLES

from .models import Notification


def notify(organization, kind: str, title: str, body: str, url: str = "", users=None):
    """
    Record a notification for each recipient and queue push delivery.

    Recipients default to the organisation's active finance users (owner,
    admin, accountant); plain staff can't act on payments or tax returns.
    Keep title/body free of customer and payer names: they can appear on a
    locked phone screen.
    """
    if users is None:
        users = organization.users.filter(is_active=True, role__in=FINANCE_ROLES)
    notifications = Notification.objects.bulk_create(
        Notification(
            organization=organization,
            user=user,
            kind=kind,
            title=title,
            body=body,
            url=url,
        )
        for user in users
    )
    if notifications:
        from .tasks import send_push_notifications

        ids = [str(n.id) for n in notifications]
        # After commit, so the worker can see the rows.
        transaction.on_commit(lambda: send_push_notifications.delay(ids))
    return notifications


def format_kes(amount) -> str:
    return f"KES {amount:,.0f}" if amount == int(amount) else f"KES {amount:,.2f}"
