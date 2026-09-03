"""Payment create / edit / move / delete must keep the invoice consistent (report #10)."""
from datetime import date
from decimal import Decimal

import pytest

from apps.payments.models import Payment
from tests.factories import (
    CustomerFactory,
    InvoiceFactory,
    InvoiceLineItemFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def client_(organization, make_auth_client):
    return make_auth_client(UserFactory(organization=organization, role="accountant"))


def _invoice(organization, unit_price="1000.00"):
    customer = CustomerFactory(organization=organization)
    inv = InvoiceFactory(organization=organization, customer=customer, status="sent")
    InvoiceLineItemFactory(invoice=inv, quantity=Decimal("1"), unit_price=Decimal(unit_price))
    inv.recalculate_totals()
    return inv  # total_amount = 1160.00


def _pay(client_, inv, amount):
    return client_.post(
        "/api/v1/payments/",
        {
            "invoice": str(inv.id),
            "amount": str(amount),
            "payment_date": str(date.today()),
            "payment_method": "cash",
        },
        format="json",
    )


def test_delete_payment_restores_balance_and_status(client_, organization):
    inv = _invoice(organization)
    resp = _pay(client_, inv, "1160.00")
    payment_id = resp.json()["id"]
    inv.refresh_from_db()
    assert inv.status == "paid" and inv.amount_due == Decimal("0.00")

    assert client_.delete(f"/api/v1/payments/{payment_id}/").status_code == 204

    inv.refresh_from_db()
    assert inv.amount_paid == Decimal("0.00")
    assert inv.amount_due == Decimal("1160.00")
    assert inv.status == "sent"


def test_reducing_payment_downgrades_paid_to_partial(client_, organization):
    inv = _invoice(organization)
    payment_id = _pay(client_, inv, "1160.00").json()["id"]
    inv.refresh_from_db()
    assert inv.status == "paid"

    resp = client_.patch(
        f"/api/v1/payments/{payment_id}/", {"amount": "200.00"}, format="json"
    )
    assert resp.status_code == 200

    inv.refresh_from_db()
    assert inv.amount_paid == Decimal("200.00")
    assert inv.status == "partial"


def test_moving_payment_between_invoices_reconciles_both(client_, organization):
    inv_a = _invoice(organization)
    inv_b = _invoice(organization)
    payment_id = _pay(client_, inv_a, "1160.00").json()["id"]
    inv_a.refresh_from_db()
    assert inv_a.status == "paid"

    resp = client_.patch(
        f"/api/v1/payments/{payment_id}/", {"invoice": str(inv_b.id)}, format="json"
    )
    assert resp.status_code == 200

    inv_a.refresh_from_db()
    inv_b.refresh_from_db()
    assert inv_a.amount_paid == Decimal("0.00") and inv_a.status == "sent"
    assert inv_b.amount_paid == Decimal("1160.00") and inv_b.status == "paid"


def test_reconcile_leaves_draft_and_cancelled_status_alone(organization):
    inv = _invoice(organization)
    inv.status = "draft"
    inv.save(update_fields=["status"])

    Payment.objects.create(
        invoice=inv,
        organization=organization,
        amount=Decimal("1160.00"),
        payment_date=date.today(),
        payment_method="cash",
    )
    inv.refresh_from_db()
    assert inv.amount_paid == Decimal("1160.00")
    assert inv.status == "draft"  # unchanged


def test_partial_then_settling_payment(client_, organization):
    inv = _invoice(organization)
    _pay(client_, inv, "160.00")
    inv.refresh_from_db()
    assert inv.status == "partial"

    _pay(client_, inv, "1000.00")
    inv.refresh_from_db()
    assert inv.status == "paid"
    assert inv.amount_due == Decimal("0.00")
