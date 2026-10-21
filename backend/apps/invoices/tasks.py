import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=5, default_retry_delay=60)
def submit_invoice_to_etims(self, invoice_id: str):
    """
    Submit an invoice to KRA eTIMS API.
    Retries up to 5 times with exponential backoff on transient failures.
    """
    from .models import Invoice, EtimsStatus
    from .etims import EtimsRejected, EtimsService

    try:
        invoice = Invoice.objects.select_related(
            "organization", "customer"
        ).prefetch_related("line_items").get(id=invoice_id)
    except Invoice.DoesNotExist:
        logger.error(f"Invoice {invoice_id} not found for eTIMS submission.")
        return

    service = EtimsService(invoice.organization)
    try:
        result = service.submit_invoice(invoice)
        invoice.etims_status = EtimsStatus.ACCEPTED
        invoice.etims_cu_serial_no = result.get("cu_serial_no", "")
        invoice.etims_receipt_number = result.get("receipt_number", "")
        invoice.etims_qr_code = result.get("qr_code", "")
        invoice.etims_submitted_at = timezone.now()
        invoice.etims_response = result
        invoice.save(
            update_fields=[
                "etims_status", "etims_cu_serial_no", "etims_receipt_number",
                "etims_qr_code", "etims_submitted_at", "etims_response",
            ]
        )
        logger.info(f"Invoice {invoice_id} accepted by KRA. SCU: {invoice.etims_cu_serial_no}")

    except EtimsRejected as exc:
        # A definitive refusal: record it and tell the finance team instead of
        # retrying the same payload (it used to sit at "submitted" forever).
        invoice.etims_status = EtimsStatus.REJECTED
        invoice.etims_response = {"resultCd": exc.code, "resultMsg": exc.message}
        invoice.save(update_fields=["etims_status", "etims_response"])
        logger.warning(f"Invoice {invoice_id} rejected by KRA: {exc}")

        from apps.notifications.models import NotificationKind
        from apps.notifications.services import notify

        notify(
            invoice.organization,
            NotificationKind.ETIMS_REJECTED,
            "eTIMS submission rejected",
            f"KRA rejected {invoice.invoice_number}. Review it and resubmit.",
            url=f"/invoices/{invoice.id}",
        )

    except Exception as exc:
        invoice.etims_status = EtimsStatus.SUBMITTED
        invoice.save(update_fields=["etims_status"])
        logger.warning(f"eTIMS submission failed for {invoice_id}: {exc}. Retrying...")
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 30)


@shared_task
def mark_overdue_invoices():
    """
    Daily: move sent/partially-paid invoices past their due date to overdue,
    and send each organisation one summary notification. Nothing else ever
    set "overdue", so the dashboard count was always 0.

    status is a bookkeeping column, writable even on invoices locked to a
    filed tax period (see invoices migration 0003).
    """
    from collections import defaultdict
    from decimal import Decimal

    from apps.notifications.models import NotificationKind
    from apps.notifications.services import format_kes, notify

    from .models import Invoice, InvoiceStatus

    today = timezone.localdate()
    newly_overdue = list(
        Invoice.objects.filter(
            status__in=[InvoiceStatus.SENT, InvoiceStatus.PARTIAL], due_date__lt=today
        ).select_related("organization")
    )
    if not newly_overdue:
        return 0

    Invoice.objects.filter(id__in=[inv.id for inv in newly_overdue]).update(
        status=InvoiceStatus.OVERDUE, updated_at=timezone.now()
    )

    by_org = defaultdict(list)
    for inv in newly_overdue:
        by_org[inv.organization].append(inv)
    for org, invoices in by_org.items():
        due = sum((inv.amount_due for inv in invoices), Decimal("0"))
        if len(invoices) == 1:
            inv = invoices[0]
            title = "Invoice overdue"
            body = f"{inv.invoice_number} is now overdue ({format_kes(due)} due)."
            url = f"/invoices/{inv.id}"
        else:
            title = f"{len(invoices)} invoices overdue"
            body = f"{len(invoices)} invoices are now overdue ({format_kes(due)} outstanding)."
            url = "/invoices"
        notify(org, NotificationKind.INVOICES_OVERDUE, title, body, url=url)

    logger.info(f"mark_overdue_invoices: {len(newly_overdue)} invoice(s) in {len(by_org)} org(s)")
    return len(newly_overdue)
