"""Tier invoice limits bucket by invoice_date, matching tax periods (report #13)."""
from datetime import date

import pytest
from dateutil.relativedelta import relativedelta
from rest_framework.exceptions import PermissionDenied

from apps.billing.limits import check_invoice_limit
from tests.factories import CustomerFactory, InvoiceFactory, OrganizationFactory

pytestmark = pytest.mark.django_db


def _make_invoices(org, n, when):
    customer = CustomerFactory(organization=org)
    for _ in range(n):
        InvoiceFactory(organization=org, customer=customer, invoice_date=when)


def test_limit_counts_invoices_dated_this_month():
    org = OrganizationFactory(subscription_tier="biashara")
    _make_invoices(org, 100, date.today())
    with pytest.raises(PermissionDenied):
        check_invoice_limit(org)


def test_invoices_dated_last_month_do_not_count():
    org = OrganizationFactory(subscription_tier="biashara")
    _make_invoices(org, 100, date.today() - relativedelta(months=1))
    # None fall in the current month -> limit not reached
    check_invoice_limit(org)
