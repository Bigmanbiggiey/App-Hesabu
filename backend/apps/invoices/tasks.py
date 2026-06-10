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
    from .etims import EtimsService

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

    except Exception as exc:
        invoice.etims_status = EtimsStatus.SUBMITTED
        invoice.save(update_fields=["etims_status"])
        logger.warning(f"eTIMS submission failed for {invoice_id}: {exc}. Retrying...")
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 30)
