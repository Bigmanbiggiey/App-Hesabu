import logging
from datetime import datetime

from dateutil import parser as date_parser
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.decorators import daraja_ip_allowlist
from apps.core.permissions import IsAccountant
from .models import MpesaTransaction, Payment, ReconciliationStatus
from .serializers import (
    DarajaC2BCallbackSerializer,
    MpesaTransactionSerializer,
    PaymentSerializer,
)
from .tasks import reconcile_mpesa_payment

logger = logging.getLogger(__name__)


def _parse_daraja_timestamp(raw):
    """
    Daraja sends ``TransTime`` as ``YYYYMMDDHHMMSS`` in East Africa Time.
    Return a timezone-aware datetime (settings.TIME_ZONE = Africa/Nairobi);
    fall back to now() if it can't be parsed rather than storing a naive value.
    """
    dt = None
    try:
        dt = datetime.strptime(str(raw), "%Y%m%d%H%M%S")
    except (ValueError, TypeError):
        try:
            dt = date_parser.parse(str(raw))
        except (ValueError, TypeError, OverflowError):
            logger.warning("Unparseable Daraja TransTime %r — using now()", raw)
            return timezone.now()
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


@api_view(["POST"])
@permission_classes([AllowAny])
@daraja_ip_allowlist
def mpesa_c2b_callback(request):
    """
    Safaricom Daraja C2B webhook endpoint.

    Unauthenticated by necessity (Safaricom calls it), so it is protected by
    a source-IP allowlist (DARAJA_ALLOWED_IPS) plus payload validation and
    shortcode->organisation matching. Amount is validated (> 0) by the
    serializer; TransID gives idempotency via get_or_create.
    """
    serializer = DarajaC2BCallbackSerializer(data=request.data)
    if not serializer.is_valid():
        logger.error(f"Invalid Daraja callback payload: {request.data}")
        return Response({"ResultCode": 1, "ResultDesc": "Invalid payload"})

    data = serializer.validated_data
    shortcode = data["BusinessShortCode"]

    from apps.accounts.models import Organization
    from django.db.models import Q
    org = Organization.objects.filter(
        Q(mpesa_paybill_number=shortcode) | Q(mpesa_till_number=shortcode)
    ).first()
    if not org:
        logger.warning(f"No organization found for shortcode {shortcode}")
        return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

    txn, created = MpesaTransaction.objects.get_or_create(
        mpesa_receipt_number=data["TransID"],
        defaults={
            "organization": org,
            "transaction_type": data["TransactionType"],
            "amount": data["TransAmount"],
            "msisdn": data["MSISDN"],
            "first_name": data["FirstName"],
            "middle_name": data["MiddleName"],
            "last_name": data["LastName"],
            "bill_ref_number": data["BillRefNumber"],
            "business_short_code": shortcode,
            "transaction_time": _parse_daraja_timestamp(data["TransTime"]),
            "raw_payload": request.data,
        },
    )

    if created:
        reconcile_mpesa_payment.delay(str(txn.id))

    return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


class MpesaTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MpesaTransactionSerializer

    def get_permissions(self):
        if self.action == "assign":
            return [IsAccountant()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = MpesaTransaction.objects.filter(
            organization=self.request.organization
        ).select_related("invoice")
        recon_status = self.request.query_params.get("reconciliation_status")
        if recon_status:
            qs = qs.filter(reconciliation_status=recon_status)
        return qs

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        """Manually assign an unallocated M-Pesa transaction to an invoice."""
        txn = self.get_object()

        if txn.reconciliation_status != ReconciliationStatus.UNALLOCATED:
            return Response(
                {"detail": "Only unallocated transactions can be manually assigned."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invoice_id = request.data.get("invoice_id")
        if not invoice_id:
            return Response(
                {"detail": "invoice_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.invoices.models import Invoice
        try:
            invoice = Invoice.objects.get(id=invoice_id, organization=request.organization)
        except Invoice.DoesNotExist:
            return Response(
                {"detail": "Invoice not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        Payment.objects.create(
            invoice=invoice,
            organization=request.organization,
            amount=txn.amount,
            payment_date=txn.transaction_time.date(),
            payment_method="mpesa",
            reference=txn.mpesa_receipt_number,
            mpesa_transaction=txn,
        )

        txn.reconciliation_status = ReconciliationStatus.MANUAL
        txn.invoice = invoice
        txn.save(update_fields=["reconciliation_status", "invoice"])

        return Response(MpesaTransactionSerializer(txn).data)


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAccountant()]

    def get_queryset(self):
        return Payment.objects.filter(
            organization=self.request.organization
        ).select_related("invoice", "mpesa_transaction")

    def perform_destroy(self, instance):
        invoice = instance.invoice
        instance.delete()
        invoice.reconcile_payments()
