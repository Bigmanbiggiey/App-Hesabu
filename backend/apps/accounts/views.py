from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from django.db.models import Sum, Count
from django.utils import timezone

from .models import Organization, User
from .serializers import (
    HesabuTokenObtainPairSerializer,
    OrganizationSerializer,
    RegisterSerializer,
    TeamMemberSerializer,
    UpdateUserSerializer,
    UserSerializer,
)


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = HesabuTokenObtainPairSerializer


class RegisterView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    if request.method == "GET":
        return Response(UserSerializer(request.user).data)
    serializer = UpdateUserSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(UserSerializer(request.user).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def team_list(request):
    """List all users in the same organisation."""
    org = request.organization
    if not org:
        return Response([])
    members = User.objects.filter(
        organization=org, is_active=True
    ).order_by("role", "first_name")
    return Response(TeamMemberSerializer(members, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    from apps.invoices.models import Invoice
    from apps.payments.models import MpesaTransaction

    org = request.organization
    if not org:
        return Response({})

    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    invoices = Invoice.objects.filter(organization=org)
    month_inv = invoices.filter(invoice_date__gte=month_start.date())

    return Response({
        "month_invoiced": str(
            month_inv.aggregate(t=Sum("total_amount"))["t"] or 0
        ),
        "month_invoice_count": month_inv.count(),
        "etims_pending": invoices.filter(
            etims_status__in=["pending", "queued", "submitted"]
        ).count(),
        "etims_accepted_month": invoices.filter(
            etims_status="accepted",
            etims_submitted_at__gte=month_start,
        ).count(),
        "etims_rejected": invoices.filter(etims_status="rejected").count(),
        "overdue_invoices": invoices.filter(status="overdue").count(),
        "unallocated_mpesa": MpesaTransaction.objects.filter(
            organization=org, reconciliation_status="unallocated"
        ).count(),
    })


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def organization_detail(request):
    org = request.organization
    if not org:
        return Response({"detail": "No organization found."}, status=404)

    if request.method == "GET":
        return Response(OrganizationSerializer(org).data)

    serializer = OrganizationSerializer(org, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reports(request):
    """Aggregated reporting data for the organisation."""
    from apps.invoices.models import Invoice
    from datetime import date
    from dateutil.relativedelta import relativedelta

    org = request.organization
    if not org:
        return Response({})

    today = date.today()

    # Monthly revenue — last 6 months
    monthly_revenue = []
    for i in range(5, -1, -1):
        month_date = today - relativedelta(months=i)
        agg = Invoice.objects.filter(
            organization=org,
            invoice_date__year=month_date.year,
            invoice_date__month=month_date.month,
        ).aggregate(total=Sum("total_amount"), vat=Sum("vat_amount"), count=Count("id"))
        monthly_revenue.append({
            "year": month_date.year,
            "month": month_date.month,
            "total": str(agg["total"] or 0),
            "vat": str(agg["vat"] or 0),
            "count": agg["count"],
        })

    # Invoice status breakdown
    status_breakdown = list(
        Invoice.objects.filter(organization=org)
        .values("status")
        .annotate(count=Count("id"), total=Sum("total_amount"))
        .order_by("status")
    )
    for row in status_breakdown:
        row["total"] = str(row["total"] or 0)

    # Top 5 customers by invoiced amount
    top_customers = list(
        Invoice.objects.filter(organization=org)
        .values("customer_name")
        .annotate(total=Sum("total_amount"), count=Count("id"))
        .order_by("-total")[:5]
    )
    for row in top_customers:
        row["total"] = str(row["total"] or 0)

    # eTIMS compliance breakdown
    etims_breakdown = list(
        Invoice.objects.filter(organization=org)
        .values("etims_status")
        .annotate(count=Count("id"))
        .order_by("etims_status")
    )

    return Response({
        "monthly_revenue": monthly_revenue,
        "status_breakdown": status_breakdown,
        "top_customers": top_customers,
        "etims_breakdown": etims_breakdown,
    })
