"""M-Pesa callback hardening (report #5).

- source-IP allowlist on both unauthenticated callback endpoints
- C2B: non-positive amounts rejected
- STK billing: subscription only activated when the paid amount matches
"""
from decimal import Decimal

import pytest

from apps.accounts.models import Organization
from apps.billing.models import BillingStatus
from apps.payments.models import MpesaTransaction
from tests.factories import BillingTransactionFactory, OrganizationFactory

pytestmark = pytest.mark.django_db

C2B_URL = "/api/v1/payments/mpesa/callback/"
STK_URL = "/api/v1/billing/mpesa/callback/"

ALLOWED = ["196.201.214.0/24"]


def _c2b_payload(shortcode, amount="1000", trans_id="RAA00000001"):
    return {
        "TransactionType": "Pay Bill",
        "TransID": trans_id,
        "TransTime": "20260903120000",
        "TransAmount": amount,
        "BusinessShortCode": shortcode,
        "BillRefNumber": "INV-00001",
        "MSISDN": "254712345678",
        "FirstName": "Jane",
        "LastName": "Doe",
    }


def _stk_payload(checkout_id, result_code=0, amount=6500):
    items = [
        {"Name": "Amount", "Value": amount},
        {"Name": "MpesaReceiptNumber", "Value": "QBC1234XYZ"},
        {"Name": "PhoneNumber", "Value": 254712345678},
    ]
    cb = {
        "MerchantRequestID": "m-1",
        "CheckoutRequestID": checkout_id,
        "ResultCode": result_code,
        "ResultDesc": "ok" if result_code == 0 else "cancelled",
    }
    if result_code == 0:
        cb["CallbackMetadata"] = {"Item": items}
    return {"Body": {"stkCallback": cb}}


# ── IP allowlist ─────────────────────────────────────────────────────────────

def test_c2b_rejects_disallowed_ip(api_client, settings):
    settings.DARAJA_ALLOWED_IPS = ALLOWED
    OrganizationFactory(mpesa_paybill_number="600123")
    resp = api_client.post(
        C2B_URL, _c2b_payload("600123"), format="json", REMOTE_ADDR="8.8.8.8"
    )
    assert resp.status_code == 403
    assert MpesaTransaction.objects.count() == 0


def test_c2b_accepts_allowlisted_ip(api_client, settings):
    settings.DARAJA_ALLOWED_IPS = ALLOWED
    OrganizationFactory(mpesa_paybill_number="600123")
    resp = api_client.post(
        C2B_URL, _c2b_payload("600123"), format="json", REMOTE_ADDR="196.201.214.55"
    )
    assert resp.status_code == 200
    assert MpesaTransaction.objects.filter(mpesa_receipt_number="RAA00000001").exists()


def test_c2b_allowlist_disabled_when_unset(api_client, settings):
    settings.DARAJA_ALLOWED_IPS = []
    OrganizationFactory(mpesa_paybill_number="600123")
    resp = api_client.post(
        C2B_URL, _c2b_payload("600123"), format="json", REMOTE_ADDR="8.8.8.8"
    )
    assert resp.status_code == 200


def test_c2b_respects_forwarded_for_when_trusted(api_client, settings):
    settings.DARAJA_ALLOWED_IPS = ALLOWED
    settings.DARAJA_TRUST_FORWARDED_FOR = True
    OrganizationFactory(mpesa_paybill_number="600123")
    resp = api_client.post(
        C2B_URL,
        _c2b_payload("600123"),
        format="json",
        REMOTE_ADDR="10.0.0.1",  # the proxy
        HTTP_X_FORWARDED_FOR="8.8.8.8",  # real client, not allowlisted
    )
    assert resp.status_code == 403


# ── C2B amount validation ────────────────────────────────────────────────────

@pytest.mark.parametrize("bad_amount", ["0", "-5", "abc"])
def test_c2b_rejects_non_positive_amount(api_client, settings, bad_amount):
    settings.DARAJA_ALLOWED_IPS = []
    OrganizationFactory(mpesa_paybill_number="600123")
    resp = api_client.post(
        C2B_URL, _c2b_payload("600123", amount=bad_amount), format="json"
    )
    assert resp.json()["ResultCode"] == 1
    assert MpesaTransaction.objects.count() == 0


# ── STK billing callback amount check ────────────────────────────────────────

def test_stk_activates_on_matching_amount(api_client, settings):
    settings.DARAJA_ALLOWED_IPS = []
    org = OrganizationFactory(subscription_status="trial", subscription_tier="biashara")
    txn = BillingTransactionFactory(
        organization=org, amount=Decimal("6500.00"), plan_tier="kampuni"
    )
    resp = api_client.post(
        STK_URL, _stk_payload(txn.mpesa_checkout_request_id, amount=6500), format="json"
    )
    assert resp.status_code == 200
    txn.refresh_from_db()
    org.refresh_from_db()
    assert txn.status == BillingStatus.SUCCESS
    assert org.subscription_status == "active"
    assert org.subscription_tier == "kampuni"


def test_stk_does_not_activate_on_amount_mismatch(api_client, settings):
    settings.DARAJA_ALLOWED_IPS = []
    org = OrganizationFactory(subscription_status="trial", subscription_tier="biashara")
    txn = BillingTransactionFactory(
        organization=org, amount=Decimal("6500.00"), plan_tier="kampuni"
    )
    resp = api_client.post(
        STK_URL, _stk_payload(txn.mpesa_checkout_request_id, amount=100), format="json"
    )
    assert resp.status_code == 200
    txn.refresh_from_db()
    org.refresh_from_db()
    assert txn.status == BillingStatus.FAILED
    assert org.subscription_status == "trial"
    assert org.subscription_tier == "biashara"


def test_stk_callback_rejects_disallowed_ip(api_client, settings):
    settings.DARAJA_ALLOWED_IPS = ALLOWED
    txn = BillingTransactionFactory()
    resp = api_client.post(
        STK_URL,
        _stk_payload(txn.mpesa_checkout_request_id),
        format="json",
        REMOTE_ADDR="8.8.8.8",
    )
    assert resp.status_code == 403
    txn.refresh_from_db()
    assert txn.status == BillingStatus.PENDING
