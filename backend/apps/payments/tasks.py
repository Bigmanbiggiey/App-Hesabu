import logging
from celery import shared_task
from decimal import Decimal

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def reconcile_mpesa_payment(self, transaction_id: str):
    """
    Auto-match an incoming M-Pesa payment to an outstanding invoice.

    Matching strategy (in order):
    1. BillRefNumber matches an invoice number exactly → high confidence match
    2. Exact amount matches a single outstanding invoice for this org → match
    3. No match → leave as unallocated for manual review
    """
    from .models import MpesaTransaction, Payment, ReconciliationStatus
    from apps.invoices.models import Invoice, InvoiceStatus

    try:
        txn = MpesaTransaction.objects.select_related("organization").get(id=transaction_id)
    except MpesaTransaction.DoesNotExist:
        return

    if txn.reconciliation_status != ReconciliationStatus.UNALLOCATED:
        return

    org = txn.organization
    amount = txn.amount
    ref = txn.bill_ref_number.strip().upper()

    # Strategy 1: BillRefNumber matches invoice number
    invoice = None
    if ref:
        invoice = Invoice.objects.filter(
            organization=org,
            invoice_number__iexact=ref,
            status__in=[InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
        ).first()

    # Strategy 2: Exact amount match on single outstanding invoice
    if not invoice:
        candidates = Invoice.objects.filter(
            organization=org,
            amount_due=amount,
            status__in=[InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
        )
        if candidates.count() == 1:
            invoice = candidates.first()

    if not invoice:
        logger.info(f"M-Pesa {txn.mpesa_receipt_number} — no match, left unallocated.")
        return

    # Determine reconciliation status
    is_full = amount >= invoice.amount_due
    recon_status = ReconciliationStatus.MATCHED if is_full else ReconciliationStatus.PARTIAL

    Payment.objects.create(
        invoice=invoice,
        organization=org,
        amount=amount,
        payment_date=txn.transaction_time.date(),
        payment_method="mpesa",
        reference=txn.mpesa_receipt_number,
        mpesa_transaction=txn,
    )

    txn.reconciliation_status = recon_status
    txn.invoice = invoice
    txn.save(update_fields=["reconciliation_status", "invoice"])

    logger.info(
        f"M-Pesa {txn.mpesa_receipt_number} ({recon_status}) → {invoice.invoice_number}"
    )

    # Notify payer via SMS
    if txn.msisdn:
        from apps.core.sms import send_sms
        phone = txn.msisdn if txn.msisdn.startswith("+") else f"+{txn.msisdn}"
        if is_full:
            msg = (
                f"Payment of KES {amount:,.0f} received for invoice "
                f"{invoice.invoice_number}. Thank you!"
            )
        else:
            msg = (
                f"Partial payment of KES {amount:,.0f} received for invoice "
                f"{invoice.invoice_number}. Balance: KES {invoice.amount_due - amount:,.0f}."
            )
        send_sms(phone, msg)
