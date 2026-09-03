"""Cross-organisation access must be impossible (report #3)."""
from datetime import date
from decimal import Decimal

import pytest

from tests.factories import InvoiceFactory, InvoiceLineItemFactory, MpesaTransactionFactory

pytestmark = pytest.mark.django_db


def _invoice_with_balance(organization, customer):
    inv = InvoiceFactory(organization=organization, customer=customer)
    InvoiceLineItemFactory(invoice=inv, quantity=Decimal("1"), unit_price=Decimal("1000.00"))
    inv.recalculate_totals()
    return inv


def test_cannot_pay_another_orgs_invoice(make_auth_client, other_user, organization, customer):
    """other_user (different org) must not create a Payment against this invoice."""
    victim_invoice = _invoice_with_balance(organization, customer)
    client = make_auth_client(other_user)

    resp = client.post(
        "/api/v1/payments/",
        {
            "invoice": str(victim_invoice.id),
            "amount": "1160.00",
            "payment_date": str(date.today()),
            "payment_method": "mpesa",
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "Invoice not found" in str(resp.content)

    victim_invoice.refresh_from_db()
    assert victim_invoice.amount_paid == Decimal("0")
    assert victim_invoice.status == "sent"


def test_cannot_assign_another_orgs_mpesa_txn_to_own_invoice(
    make_auth_client, user, other_user, other_organization, organization, customer
):
    """A txn belonging to other_organization is invisible to this org's assign call."""
    foreign_txn = MpesaTransactionFactory(organization=other_organization)
    client = make_auth_client(user)

    resp = client.post(
        f"/api/v1/payments/mpesa/transactions/{foreign_txn.id}/assign/",
        {"invoice_id": str(_invoice_with_balance(organization, customer).id)},
        format="json",
    )
    assert resp.status_code == 404


def test_payment_list_is_org_scoped(make_auth_client, user, other_user, organization, customer):
    inv = _invoice_with_balance(organization, customer)
    make_auth_client(user).post(
        "/api/v1/payments/",
        {
            "invoice": str(inv.id),
            "amount": "100.00",
            "payment_date": str(date.today()),
            "payment_method": "cash",
        },
        format="json",
    )

    resp = make_auth_client(other_user).get("/api/v1/payments/")
    assert resp.status_code == 200
    assert resp.json()["count"] == 0
