"""
End-to-end smoke tests for the core money paths.

These exercise the routes that PR1 unblocks: invoice creation (was raising
TypeError on a duplicate ``organization`` kwarg and on Decimal * float VAT),
payment creation, and the register -> login handshake.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest

pytestmark = pytest.mark.django_db


def test_create_invoice_computes_totals(auth_client, customer):
    payload = {
        "customer": str(customer.id),
        "invoice_date": str(date.today()),
        "due_date": str(date.today() + timedelta(days=30)),
        "line_items": [
            {
                "description": "Consulting",
                "quantity": "2",
                "unit_price": "1000.00",
                "vat_class": "standard",
            },
            {
                "description": "Zero-rated goods",
                "quantity": "1",
                "unit_price": "500.00",
                "vat_class": "zero_rated",
            },
        ],
    }
    resp = auth_client.post("/api/v1/invoices/", payload, format="json")
    assert resp.status_code == 201, resp.content

    body = resp.json()
    assert body["invoice_number"]  # auto-assigned from the org sequence
    assert Decimal(body["subtotal"]) == Decimal("2500.00")
    assert Decimal(body["vat_amount"]) == Decimal("320.00")  # 16% of 2000 only
    assert Decimal(body["total_amount"]) == Decimal("2820.00")
    assert Decimal(body["amount_due"]) == Decimal("2820.00")


def test_create_payment_updates_invoice_balance(auth_client, organization, customer):
    from tests.factories import InvoiceFactory, InvoiceLineItemFactory

    inv = InvoiceFactory(organization=organization, customer=customer)
    InvoiceLineItemFactory(invoice=inv, quantity=Decimal("1"), unit_price=Decimal("1000.00"))
    inv.recalculate_totals()

    resp = auth_client.post(
        "/api/v1/payments/",
        {
            "invoice": str(inv.id),
            "amount": "400.00",
            "payment_date": str(date.today()),
            "payment_method": "mpesa",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content

    inv.refresh_from_db()
    assert inv.amount_paid == Decimal("400.00")
    assert inv.amount_due == inv.total_amount - Decimal("400.00")
    assert inv.status == "partial"


def test_register_then_login(api_client):
    reg = api_client.post(
        "/api/v1/auth/register/",
        {
            "email": "founder@example.com",
            "password": "s3cretpass",
            "first_name": "Founder",
            "last_name": "One",
            "organization_name": "Acme Ltd",
            "kra_pin": "A123456789Z",
        },
        format="json",
    )
    assert reg.status_code == 201, reg.content
    assert reg.json()["role"] == "owner"

    login = api_client.post(
        "/api/v1/auth/login/",
        {"email": "founder@example.com", "password": "s3cretpass"},
        format="json",
    )
    assert login.status_code == 200, login.content
    assert "access" in login.json()
    assert login.json()["user"]["email"] == "founder@example.com"
