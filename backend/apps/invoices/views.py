from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.billing.limits import check_invoice_limit
from .models import Customer, Invoice
from .serializers import (
    CustomerSerializer,
    InvoiceSerializer,
    InvoiceListSerializer,
)
from .tasks import submit_invoice_to_etims


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        return Customer.objects.filter(organization=self.request.organization)

    def perform_create(self, serializer):
        serializer.save(organization=self.request.organization)


class InvoiceViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "etims_status", "customer"]

    def get_queryset(self):
        return (
            Invoice.objects.filter(organization=self.request.organization)
            .select_related("customer")
            .prefetch_related("line_items")
        )

    def get_serializer_class(self):
        if self.action == "list":
            return InvoiceListSerializer
        return InvoiceSerializer

    def perform_create(self, serializer):
        check_invoice_limit(self.request.organization)
        # InvoiceSerializer.create() reads the organization from the request
        # context and assigns the invoice number; passing organization= here
        # too would duplicate the kwarg and raise TypeError.
        serializer.save()

    @action(detail=True, methods=["post"])
    def submit_to_etims(self, request, pk=None):
        invoice = self.get_object()
        if invoice.etims_status in ("submitted", "accepted"):
            return Response(
                {"detail": "Invoice already submitted to KRA."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        submit_invoice_to_etims.delay(str(invoice.id))
        invoice.etims_status = "queued"
        invoice.save(update_fields=["etims_status"])
        return Response({"detail": "Invoice queued for eTIMS submission."})

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        from .pdf import generate_invoice_pdf
        invoice = self.get_object()
        return generate_invoice_pdf(invoice)
