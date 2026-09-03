"""
Filed tax periods and eTIMS-accepted invoices must be immutable (report #4).

The API-layer guard is exercised on SQLite; the PostgreSQL trigger (migration
invoices/0003) is exercised by the @pytest.mark.postgres tests, which are
skipped unless the suite runs against Postgres.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.db import Error as DBError

from apps.invoices.models import Invoice, InvoiceLineItem
from tests.factories import (
    CustomerFactory,
    InvoiceFactory,
    InvoiceLineItemFactory,
    TaxPeriodFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

MARCH_2026 = date(2026, 3, 15)


@pytest.fixture
def accountant_client(organization, make_auth_client):
    return make_auth_client(UserFactory(organization=organization, role="accountant"))


def _invoice_in_march(organization):
    customer = CustomerFactory(organization=organization)
    inv = InvoiceFactory(
        organization=organization, customer=customer, invoice_date=MARCH_2026
    )
    InvoiceLineItemFactory(invoice=inv, quantity=Decimal("1"), unit_price=Decimal("1000.00"))
    inv.recalculate_totals()
    return inv


def _patch_line_items(client, inv):
    return client.patch(
        f"/api/v1/invoices/{inv.id}/",
        {
            "line_items": [
                {"description": "tampered", "quantity": "1", "unit_price": "5.00",
                 "vat_class": "standard"}
            ]
        },
        format="json",
    )


# ── API-layer enforcement ────────────────────────────────────────────────────

def test_locking_period_links_invoices(organization):
    inv = _invoice_in_march(organization)
    period = TaxPeriodFactory(organization=organization, year=2026, month=3)

    period.lock()

    inv.refresh_from_db()
    period.refresh_from_db()
    assert period.status == "closed"
    assert inv.tax_period_id == period.id


def test_locked_period_invoice_cannot_be_edited(organization, accountant_client):
    inv = _invoice_in_march(organization)
    TaxPeriodFactory(organization=organization, year=2026, month=3).lock()

    resp = _patch_line_items(accountant_client, inv)
    assert resp.status_code == 400
    assert "filed tax period" in str(resp.content)

    inv.refresh_from_db()
    assert inv.line_items.count() == 1
    assert inv.line_items.first().description == "Consulting"


def test_locked_period_invoice_cannot_be_deleted(organization, accountant_client):
    inv = _invoice_in_march(organization)
    TaxPeriodFactory(organization=organization, year=2026, month=3).lock()

    resp = accountant_client.delete(f"/api/v1/invoices/{inv.id}/")
    assert resp.status_code == 400
    assert "cannot be deleted" in str(resp.content)
    assert Invoice.objects.filter(id=inv.id).exists()


def test_etims_accepted_invoice_is_frozen(organization, accountant_client):
    inv = _invoice_in_march(organization)
    Invoice.objects.filter(id=inv.id).update(etims_status="accepted")

    resp = _patch_line_items(accountant_client, inv)
    assert resp.status_code == 400
    assert "KRA eTIMS" in str(resp.content)


def test_open_period_invoice_still_editable(organization, accountant_client):
    inv = _invoice_in_march(organization)
    open_period = TaxPeriodFactory(organization=organization, year=2026, month=3, status="open")
    Invoice.objects.filter(id=inv.id).update(tax_period=open_period)

    resp = _patch_line_items(accountant_client, inv)
    assert resp.status_code == 200
    inv.refresh_from_db()
    assert inv.line_items.first().description == "tampered"


def test_payment_still_allowed_on_locked_invoice(organization, accountant_client):
    inv = _invoice_in_march(organization)
    TaxPeriodFactory(organization=organization, year=2026, month=3).lock()

    resp = accountant_client.post(
        "/api/v1/payments/",
        {
            "invoice": str(inv.id),
            "amount": "300.00",
            "payment_date": str(date.today()),
            "payment_method": "cash",
        },
        format="json",
    )
    assert resp.status_code == 201
    inv.refresh_from_db()
    assert inv.amount_paid == Decimal("300.00")


def test_paye_period_lock_leaves_invoices_untouched(organization):
    inv = _invoice_in_march(organization)
    paye = TaxPeriodFactory(
        organization=organization, period_type="paye", year=2026, month=3
    )
    paye.lock()

    inv.refresh_from_db()
    assert inv.tax_period_id is None


# ── Database-level enforcement (PostgreSQL only) ─────────────────────────────

@pytest.mark.postgres
def test_db_trigger_blocks_raw_fiscal_update(organization):
    inv = _invoice_in_march(organization)
    TaxPeriodFactory(organization=organization, year=2026, month=3).lock()

    with pytest.raises(DBError):
        Invoice.objects.filter(id=inv.id).update(total_amount=Decimal("1.00"))


@pytest.mark.postgres
def test_db_trigger_allows_payment_bookkeeping_update(organization):
    inv = _invoice_in_march(organization)
    TaxPeriodFactory(organization=organization, year=2026, month=3).lock()

    # amount_paid / status are not fiscal fields — must still be writable.
    Invoice.objects.filter(id=inv.id).update(amount_paid=Decimal("10.00"), status="partial")


@pytest.mark.postgres
def test_db_trigger_blocks_line_item_delete(organization):
    inv = _invoice_in_march(organization)
    TaxPeriodFactory(organization=organization, year=2026, month=3).lock()

    with pytest.raises(DBError):
        InvoiceLineItem.objects.filter(invoice=inv).delete()
