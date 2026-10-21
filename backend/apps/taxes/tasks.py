import logging
from datetime import date

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)

# KRA deadlines for the previous month's return: VAT by the 20th, PAYE by the
# 9th. Reminders go out three days ahead.
VAT_DUE_DAY, VAT_REMIND_DAY = 20, 17
PAYE_DUE_DAY, PAYE_REMIND_DAY = 9, 6


def _previous_month(today: date) -> tuple[int, int]:
    return (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)


@shared_task
def send_filing_reminders(today: date | None = None):
    """
    Daily: on the reminder days, notify organisations whose return for last
    month hasn't been submitted to iTax yet. VAT only for VAT-registered
    organisations; PAYE only for those with active employees.
    """
    from apps.accounts.models import Organization
    from apps.notifications.models import NotificationKind
    from apps.notifications.services import notify

    from .models import PeriodStatus, PeriodType, TaxPeriod

    today = today or timezone.localdate()
    if today.day == VAT_REMIND_DAY:
        period_type, due_day, label = PeriodType.VAT, VAT_DUE_DAY, "VAT"
        orgs = Organization.objects.exclude(vat_registration_number="")
    elif today.day == PAYE_REMIND_DAY:
        period_type, due_day, label = PeriodType.PAYE, PAYE_DUE_DAY, "PAYE"
        orgs = Organization.objects.filter(employees__is_active=True).distinct()
    else:
        return 0

    year, month = _previous_month(today)
    filed = TaxPeriod.objects.filter(
        period_type=period_type, year=year, month=month, status=PeriodStatus.SUBMITTED
    ).values_list("organization_id", flat=True)
    month_name = date(year, month, 1).strftime("%B")
    due = f"{due_day} {today.strftime('%B')}"

    sent = 0
    for org in orgs.exclude(id__in=filed):
        notify(
            org,
            NotificationKind.FILING_REMINDER,
            f"{label} return due {due}",
            f"Your {month_name} {label} return isn't filed yet. It's due on {due}.",
            url="/taxes",
        )
        sent += 1
    logger.info(f"send_filing_reminders: {label} reminder sent to {sent} org(s)")
    return sent
