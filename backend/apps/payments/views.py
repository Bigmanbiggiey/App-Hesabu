import logging
from dateutil import parser as date_parser
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import MpesaTransaction, Payment, ReconciliationStatus
from .serializers import (
    DarajaC2BCallbackSerializer,
    MpesaTransactionSerializer,
    PaymentSerializer,
)
from .tasks import reconcile_mpesa_payment

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([AllowAny])
def mpesa_c2b_callback(request):
    """
    Safaricom Daraja C2B webhook endpoint.
    Must be publicly accessible (no auth). Validated by shortcode matching.
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
            "transaction_time": date_parser.parse(data["TransTime"]),
            "raw_payload": request.data,
        },
    )

    if created:
        reconcile_mpesa_payment.delay(str(txn.id))

    return Response({"ResultCode": 0, "ResultDesc": "Accepted"})


class MpesaTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MpesaTransactionSerializer

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

    def get_queryset(self):
        return Payment.objects.filter(
            organization=self.request.organization
        ).select_related("invoice", "mpesa_transaction")
