from decimal import Decimal
from django.db.models import Sum
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .calculators import calculate_full_payroll
from .models import TaxPeriod, VATReturn, Employee, PAYEReturn
from .serializers import (
    EmployeeSerializer,
    PAYEReturnSerializer,
    PayrollCalculatorSerializer,
    TaxPeriodSerializer,
    VATReturnSerializer,
)


class TaxPeriodViewSet(viewsets.ModelViewSet):
    serializer_class = TaxPeriodSerializer

    def get_queryset(self):
        qs = TaxPeriod.objects.filter(organization=self.request.organization)
        period_type = self.request.query_params.get("period_type")
        if period_type:
            qs = qs.filter(period_type=period_type)
        return qs

    def perform_create(self, serializer):
        serializer.save(organization=self.request.organization)

    @action(detail=True, methods=["post"])
    def lock(self, request, pk=None):
        period = self.get_object()
        if period.status != "open":
            return Response({"detail": "Only open periods can be locked."}, status=400)
        period.lock()
        return Response(TaxPeriodSerializer(period).data)

    @action(detail=True, methods=["post"])
    def generate_vat_return(self, request, pk=None):
        """Compute output VAT from all accepted eTIMS invoices for this period."""
        period = self.get_object()
        if period.period_type != "vat":
            return Response(
                {"detail": "Not a VAT period."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if period.status != "open":
            return Response(
                {"detail": "Period is locked — cannot regenerate."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.invoices.models import Invoice
        invoices_qs = Invoice.objects.filter(
            organization=request.organization,
            invoice_date__year=period.year,
            invoice_date__month=period.month,
            etims_status="accepted",
        )
        agg = invoices_qs.aggregate(output_vat=Sum("vat_amount"))
        output_vat = agg["output_vat"] or Decimal("0")
        invoice_count = invoices_qs.count()

        vat_return, _ = VATReturn.objects.update_or_create(
            tax_period=period,
            defaults={
                "output_vat": output_vat,
                "return_data": {"invoice_count": invoice_count},
            },
        )
        vat_return.calculate()
        return Response(VATReturnSerializer(vat_return).data)

    @action(detail=True, methods=["post"])
    def generate_paye_returns(self, request, pk=None):
        """Compute PAYE for all active employees for this period."""
        period = self.get_object()
        if period.period_type != "paye":
            return Response(
                {"detail": "Not a PAYE period."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if period.status != "open":
            return Response(
                {"detail": "Period is locked — cannot regenerate."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employees = Employee.objects.filter(
            organization=request.organization, is_active=True
        )
        if not employees.exists():
            return Response(
                {"detail": "No active employees found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        for emp in employees:
            payroll = calculate_full_payroll(emp.gross_salary)
            paye_return, _ = PAYEReturn.objects.update_or_create(
                tax_period=period,
                employee=emp,
                defaults={
                    "gross_pay": payroll["gross_salary"],
                    "taxable_income": payroll["taxable_income"],
                    "paye_deducted": payroll["paye_deducted"],
                    "personal_relief": payroll["personal_relief"],
                    "nhif_deduction": payroll["nhif_deduction"],
                    "nssf_deduction": payroll["nssf_deduction"],
                    "housing_levy": payroll["housing_levy"],
                    "net_pay": payroll["net_pay"],
                },
            )
            results.append(paye_return)

        return Response(PAYEReturnSerializer(results, many=True).data)


class VATReturnViewSet(viewsets.ModelViewSet):
    serializer_class = VATReturnSerializer

    def get_queryset(self):
        return VATReturn.objects.filter(
            tax_period__organization=self.request.organization
        ).select_related("tax_period")


class EmployeeViewSet(viewsets.ModelViewSet):
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        qs = Employee.objects.filter(organization=self.request.organization)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    @action(detail=False, methods=["post"])
    def calculate_payroll(self, request):
        serializer = PayrollCalculatorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = calculate_full_payroll(serializer.validated_data["gross_salary"])
        return Response(result)


class PAYEReturnViewSet(viewsets.ModelViewSet):
    serializer_class = PAYEReturnSerializer

    def get_queryset(self):
        qs = PAYEReturn.objects.filter(
            tax_period__organization=self.request.organization
        ).select_related("employee", "tax_period")
        tax_period = self.request.query_params.get("tax_period")
        if tax_period:
            qs = qs.filter(tax_period_id=tax_period)
        return qs
