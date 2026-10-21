"""Role enforcement across the write APIs (report #6)."""
from datetime import date, timedelta

import pytest

from tests.factories import CustomerFactory, OrganizationFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def org():
    return OrganizationFactory()


@pytest.fixture
def clients(org, make_auth_client):
    """One authenticated client per role, all in the same org."""
    return {
        role: make_auth_client(UserFactory(organization=org, role=role))
        for role in ("owner", "admin", "accountant", "staff")
    }


def _invoice_payload(customer):
    return {
        "customer": str(customer.id),
        "invoice_date": str(date.today()),
        "due_date": str(date.today() + timedelta(days=30)),
        "line_items": [
            {"description": "x", "quantity": "1", "unit_price": "10.00", "vat_class": "standard"}
        ],
    }


@pytest.mark.parametrize(
    "role,expected",
    [("owner", 201), ("admin", 201), ("accountant", 201), ("staff", 403)],
)
def test_invoice_create_by_role(clients, org, role, expected):
    customer = CustomerFactory(organization=org)
    resp = clients[role].post("/api/v1/invoices/", _invoice_payload(customer), format="json")
    assert resp.status_code == expected


def test_invoice_read_allowed_for_staff(clients):
    assert clients["staff"].get("/api/v1/invoices/").status_code == 200


@pytest.mark.parametrize(
    "role,expected",
    [("owner", 200), ("admin", 200), ("accountant", 403), ("staff", 403)],
)
def test_org_settings_patch_by_role(clients, role, expected):
    resp = clients[role].patch(
        "/api/v1/auth/organization/",
        {"mpesa_paybill_number": "999999"},
        format="json",
    )
    assert resp.status_code == expected


@pytest.mark.parametrize(
    "role,expected",
    [("owner", 200), ("admin", 200), ("accountant", 403), ("staff", 403)],
)
def test_cancel_subscription_by_role(clients, role, expected):
    resp = clients[role].post("/api/v1/billing/cancel/", {}, format="json")
    assert resp.status_code == expected


@pytest.mark.parametrize(
    "role,expected",
    [("accountant", 201), ("staff", 403)],
)
def test_tax_period_create_by_role(clients, role, expected):
    resp = clients[role].post(
        "/api/v1/taxes/periods/",
        {"period_type": "vat", "year": 2026, "month": 3},
        format="json",
    )
    assert resp.status_code == expected


def test_staff_can_still_use_payroll_calculator(clients):
    resp = clients["staff"].post(
        "/api/v1/taxes/employees/calculate_payroll/",
        {"gross_salary": "100000"},
        format="json",
    )
    assert resp.status_code == 200


# ── Users without an organisation (e.g. made with `createsuperuser`) ─────────

@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/invoices/",
        "/api/v1/invoices/customers/",
        "/api/v1/payments/",
        "/api/v1/payments/mpesa/transactions/",
        "/api/v1/taxes/periods/",
        "/api/v1/taxes/vat-returns/",
        "/api/v1/taxes/employees/",
        "/api/v1/auth/organization/",
        "/api/v1/auth/dashboard/stats/",
        "/api/v1/auth/team/",
        "/api/v1/billing/status/",
    ],
)
def test_user_without_org_gets_403_not_500(make_auth_client, url):
    client = make_auth_client(UserFactory(organization=None, is_superuser=True, is_staff=True))
    resp = client.get(url)
    assert resp.status_code == 403
    assert resp.json()["detail"].startswith("Your account is not linked to an organisation")


def test_user_without_org_can_still_load_profile(make_auth_client):
    """/auth/me/ doesn't need an org, so the frontend can still render the user."""
    client = make_auth_client(UserFactory(organization=None))
    assert client.get("/api/v1/auth/me/").status_code == 200
