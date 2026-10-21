"""Notifications: recipients, API, push delivery, and the event triggers."""

import json
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from celery.exceptions import Retry
from django.conf import settings
from django.utils import timezone

from apps.invoices.etims import EtimsError, EtimsRejected
from apps.invoices.tasks import mark_overdue_invoices, submit_invoice_to_etims
from apps.notifications.models import (
    Notification,
    NotificationKind,
    NotificationPreference,
    PushSubscription,
)
from apps.notifications.services import notify
from apps.notifications.tasks import send_push_notifications
from apps.payments.tasks import reconcile_mpesa_payment
from apps.taxes.models import Employee
from apps.taxes.tasks import send_filing_reminders
from tests.factories import (
    InvoiceFactory,
    MpesaTransactionFactory,
    OrganizationFactory,
    TaxPeriodFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def org():
    return OrganizationFactory()


@pytest.fixture
def team(org):
    """One user per role, plus an inactive owner, all in ``org``."""
    users = {
        role: UserFactory(organization=org, role=role)
        for role in ("owner", "admin", "accountant", "staff")
    }
    users["inactive"] = UserFactory(organization=org, role="owner", is_active=False)
    return users


@pytest.fixture
def vapid(settings):
    settings.VAPID_PUBLIC_KEY = "BPublicKeyForTests"
    settings.VAPID_PRIVATE_KEY = "private-key-for-tests"


def _subscribe(user, n=1):
    return PushSubscription.objects.create(
        user=user,
        endpoint=f"https://push.example.com/{user.id}/{n}",
        p256dh="p" * 20,
        auth="a" * 10,
    )


# ── Recipients ────────────────────────────────────────────────────────────────


def test_notify_reaches_active_finance_roles_only(org, team):
    other_org_owner = UserFactory(role="owner")
    notify(org, NotificationKind.PAYMENT_RECEIVED, "t", "b")
    recipients = set(Notification.objects.values_list("user_id", flat=True))
    assert recipients == {team["owner"].id, team["admin"].id, team["accountant"].id}
    assert other_org_owner.id not in recipients


def test_notify_queues_push_after_commit(org, team, django_capture_on_commit_callbacks):
    with mock.patch("apps.notifications.tasks.send_push_notifications.delay") as delay:
        with django_capture_on_commit_callbacks(execute=True):
            created = notify(org, NotificationKind.PAYMENT_RECEIVED, "t", "b")
    delay.assert_called_once_with([str(n.id) for n in created])


# ── API ───────────────────────────────────────────────────────────────────────


def test_list_shows_only_my_notifications(org, team, make_auth_client):
    notify(org, NotificationKind.PAYMENT_RECEIVED, "mine", "b", users=[team["owner"]])
    notify(
        org,
        NotificationKind.PAYMENT_RECEIVED,
        "colleague's",
        "b",
        users=[team["admin"]],
    )
    other = UserFactory(role="owner")
    notify(
        other.organization,
        NotificationKind.PAYMENT_RECEIVED,
        "other org",
        "b",
        users=[other],
    )

    resp = make_auth_client(team["owner"]).get("/api/v1/notifications/")
    assert resp.status_code == 200
    assert [n["title"] for n in resp.json()["results"]] == ["mine"]


def test_unread_count_read_and_read_all(org, team, make_auth_client):
    client = make_auth_client(team["owner"])
    a, b = (
        notify(org, NotificationKind.TEST, t, "b", users=[team["owner"]])[0]
        for t in ("a", "b")
    )
    assert client.get("/api/v1/notifications/unread-count/").json() == {"count": 2}

    assert client.post(f"/api/v1/notifications/{a.id}/read/").status_code == 204
    assert client.get("/api/v1/notifications/unread-count/").json() == {"count": 1}

    assert client.post("/api/v1/notifications/read-all/").status_code == 204
    assert client.get("/api/v1/notifications/unread-count/").json() == {"count": 0}


def test_cannot_mark_someone_elses_notification(org, team, make_auth_client):
    theirs = notify(org, NotificationKind.TEST, "t", "b", users=[team["admin"]])[0]
    client = make_auth_client(team["owner"])
    assert client.post(f"/api/v1/notifications/{theirs.id}/read/").status_code == 404
    theirs.refresh_from_db()
    assert theirs.read_at is None
    assert client.post("/api/v1/notifications/not-a-uuid/read/").status_code == 404


def test_push_subscription_upsert_and_reassign(org, team, make_auth_client):
    body = {
        "endpoint": "https://push.example.com/device-1",
        "keys": {"p256dh": "k" * 20, "auth": "a" * 10},
    }
    assert (
        make_auth_client(team["owner"])
        .post("/api/v1/notifications/push/subscription/", body, format="json")
        .status_code
        == 201
    )
    # Same device, next person logs in: the device now belongs to them.
    assert (
        make_auth_client(team["admin"])
        .post("/api/v1/notifications/push/subscription/", body, format="json")
        .status_code
        == 201
    )
    sub = PushSubscription.objects.get()
    assert sub.user == team["admin"]

    # Only the owner of a subscription can remove it.
    make_auth_client(team["owner"]).delete(
        "/api/v1/notifications/push/subscription/", body, format="json"
    )
    assert PushSubscription.objects.count() == 1
    make_auth_client(team["admin"]).delete(
        "/api/v1/notifications/push/subscription/", body, format="json"
    )
    assert PushSubscription.objects.count() == 0


def test_push_subscription_requires_keys(team, make_auth_client):
    resp = make_auth_client(team["owner"]).post(
        "/api/v1/notifications/push/subscription/",
        {"endpoint": "https://push.example.com/x", "keys": {}},
        format="json",
    )
    assert resp.status_code == 400


def test_preferences_default_on_and_patchable(team, make_auth_client):
    client = make_auth_client(team["owner"])
    assert client.get("/api/v1/notifications/preferences/").json() == {
        "payment_received": True,
        "etims_rejected": True,
        "invoices_overdue": True,
        "filing_reminder": True,
    }
    resp = client.patch(
        "/api/v1/notifications/preferences/", {"filing_reminder": False}, format="json"
    )
    assert resp.json()["filing_reminder"] is False


def test_vapid_key_endpoint(team, make_auth_client, vapid):
    assert make_auth_client(team["owner"]).get(
        "/api/v1/notifications/push/key/"
    ).json() == {"public_key": "BPublicKeyForTests"}


def test_send_test_notifies_only_the_caller(org, team, make_auth_client):
    assert (
        make_auth_client(team["staff"]).post("/api/v1/notifications/test/").status_code
        == 202
    )
    assert list(Notification.objects.values_list("user_id", "kind")) == [
        (team["staff"].id, "test")
    ]


def test_user_without_org_gets_403(make_auth_client):
    client = make_auth_client(UserFactory(organization=None))
    assert client.get("/api/v1/notifications/").status_code == 403


# ── Push delivery ─────────────────────────────────────────────────────────────


def test_push_sends_payload_to_each_device(org, team, vapid):
    _subscribe(team["owner"], 1)
    _subscribe(team["owner"], 2)
    n = notify(
        org,
        NotificationKind.PAYMENT_RECEIVED,
        "M-Pesa payment received",
        "KES 500 received for INV-1.",
        url="/invoices/x",
        users=[team["owner"]],
    )[0]
    with mock.patch("pywebpush.webpush") as webpush:
        assert send_push_notifications([str(n.id)]) == 2
    payload = json.loads(webpush.call_args.kwargs["data"])
    assert payload == {
        "title": "M-Pesa payment received",
        "body": "KES 500 received for INV-1.",
        "url": "/invoices/x",
        "id": str(n.id),
        "tag": "payment_received",
    }
    assert webpush.call_args.kwargs["vapid_claims"] == {"sub": settings.VAPID_SUBJECT}


def test_push_respects_preferences(org, team, vapid):
    _subscribe(team["owner"])
    NotificationPreference.objects.create(user=team["owner"], payment_received=False)
    n = notify(org, NotificationKind.PAYMENT_RECEIVED, "t", "b", users=[team["owner"]])[
        0
    ]
    with mock.patch("pywebpush.webpush") as webpush:
        assert send_push_notifications([str(n.id)]) == 0
    webpush.assert_not_called()
    assert Notification.objects.filter(id=n.id).exists()  # still in the in-app list


@pytest.mark.parametrize("status,kept", [(410, False), (404, False), (500, True)])
def test_push_prunes_dead_subscriptions(org, team, vapid, status, kept):
    from pywebpush import WebPushException

    sub = _subscribe(team["owner"])
    n = notify(org, NotificationKind.TEST, "t", "b", users=[team["owner"]])[0]
    error = WebPushException("gone", response=mock.Mock(status_code=status))
    with mock.patch("pywebpush.webpush", side_effect=error):
        send_push_notifications([str(n.id)])
    assert PushSubscription.objects.filter(id=sub.id).exists() is kept


def test_one_broken_device_does_not_block_the_others(org, team, vapid):
    _subscribe(team["owner"], 1)
    _subscribe(team["owner"], 2)
    n = notify(org, NotificationKind.TEST, "t", "b", users=[team["owner"]])[0]
    calls = []

    def flaky(**kwargs):
        calls.append(kwargs["subscription_info"]["endpoint"])
        if len(calls) == 1:
            raise ValueError("Could not deserialize key data")

    with mock.patch("pywebpush.webpush", side_effect=flaky):
        assert send_push_notifications([str(n.id)]) == 1
    assert len(calls) == 2
    assert PushSubscription.objects.count() == 2  # not pruned: may be transient


def test_push_skipped_without_vapid_keys(org, team, settings):
    settings.VAPID_PRIVATE_KEY = ""
    _subscribe(team["owner"])
    n = notify(org, NotificationKind.TEST, "t", "b", users=[team["owner"]])[0]
    with mock.patch("pywebpush.webpush") as webpush:
        assert send_push_notifications([str(n.id)]) == 0
    webpush.assert_not_called()


# ── Trigger: M-Pesa payments ──────────────────────────────────────────────────


def test_matched_payment_notifies_with_amount_and_invoice_only(org, team):
    inv = InvoiceFactory(
        organization=org, total_amount=Decimal("2000"), amount_due=Decimal("2000")
    )
    txn = MpesaTransactionFactory(
        organization=org,
        amount=Decimal("2000"),
        bill_ref_number=inv.invoice_number,
        first_name="JOHN",
        last_name="KAMAU",
    )
    reconcile_mpesa_payment(str(txn.id))
    n = Notification.objects.filter(user=team["owner"]).get()
    assert n.title == "M-Pesa payment received"
    assert n.body == f"KES 2,000 received for {inv.invoice_number}."
    assert n.url == f"/invoices/{inv.id}"
    assert "JOHN" not in n.body and "KAMAU" not in n.body


def test_partial_payment_mentions_balance(org, team):
    inv = InvoiceFactory(
        organization=org, total_amount=Decimal("2000"), amount_due=Decimal("2000")
    )
    txn = MpesaTransactionFactory(
        organization=org, amount=Decimal("500"), bill_ref_number=inv.invoice_number
    )
    reconcile_mpesa_payment(str(txn.id))
    assert Notification.objects.filter(user=team["owner"]).get().body == (
        f"KES 500 received for {inv.invoice_number}; KES 1,500 still due."
    )


def test_unallocated_payment_asks_for_review(org, team):
    txn = MpesaTransactionFactory(
        organization=org, amount=Decimal("750"), bill_ref_number="NOPE"
    )
    reconcile_mpesa_payment(str(txn.id))
    n = Notification.objects.filter(user=team["owner"]).get()
    assert n.title == "Payment needs allocation"
    assert n.url == "/payments"


# ── Trigger: eTIMS ────────────────────────────────────────────────────────────


def test_kra_rejection_marks_rejected_and_notifies(org, team):
    inv = InvoiceFactory(organization=org)
    with mock.patch(
        "apps.invoices.etims.EtimsService.submit_invoice",
        side_effect=EtimsRejected("E12", "Invalid PIN"),
    ):
        submit_invoice_to_etims(str(inv.id))
    inv.refresh_from_db()
    assert inv.etims_status == "rejected"
    assert inv.etims_response == {"resultCd": "E12", "resultMsg": "Invalid PIN"}
    n = Notification.objects.filter(user=team["owner"]).get()
    assert n.kind == "etims_rejected" and inv.invoice_number in n.body


def test_network_error_still_retries_without_notifying(org, team):
    inv = InvoiceFactory(organization=org)
    with mock.patch(
        "apps.invoices.etims.EtimsService.submit_invoice",
        side_effect=EtimsError("timed out"),
    ):
        with pytest.raises((Retry, EtimsError)):
            submit_invoice_to_etims.apply(args=[str(inv.id)], throw=True)
    inv.refresh_from_db()
    assert inv.etims_status == "submitted"
    assert not Notification.objects.exists()


# ── Trigger: overdue ──────────────────────────────────────────────────────────


def test_mark_overdue_updates_status_and_sends_one_summary_per_org(org, team):
    past = timezone.localdate() - timedelta(days=1)
    a = InvoiceFactory(
        organization=org, status="sent", due_date=past, amount_due=Decimal("1000")
    )
    b = InvoiceFactory(
        organization=org, status="partial", due_date=past, amount_due=Decimal("500")
    )
    untouched = [
        InvoiceFactory(organization=org, status="paid", due_date=past),
        InvoiceFactory(organization=org, status="draft", due_date=past),
        InvoiceFactory(organization=org, status="sent", due_date=timezone.localdate()),
    ]
    assert mark_overdue_invoices() == 2
    for inv in (a, b):
        inv.refresh_from_db()
        assert inv.status == "overdue"
    for inv in untouched:
        status = inv.status
        inv.refresh_from_db()
        assert inv.status == status

    owner_notes = Notification.objects.filter(user=team["owner"])
    assert owner_notes.count() == 1
    assert (
        owner_notes.get().body == "2 invoices are now overdue (KES 1,500 outstanding)."
    )

    # Idempotent: nothing new tomorrow for the same invoices.
    assert mark_overdue_invoices() == 0
    assert owner_notes.count() == 1


# ── Trigger: filing reminders ─────────────────────────────────────────────────


def test_vat_reminder_on_the_17th_for_unfiled_vat_registered_orgs(team, org):
    org.vat_registration_number = "0123456A"
    org.save()
    filed_org = OrganizationFactory(vat_registration_number="0999999B")
    UserFactory(organization=filed_org, role="owner")
    TaxPeriodFactory(
        organization=filed_org,
        period_type="vat",
        year=2026,
        month=9,
        status="submitted",
    )
    not_vat_registered = OrganizationFactory(vat_registration_number="")
    UserFactory(organization=not_vat_registered, role="owner")

    assert send_filing_reminders(today=date(2026, 10, 17)) == 1
    n = Notification.objects.filter(user=team["owner"]).get()
    assert n.title == "VAT return due 20 October"
    assert (
        n.body == "Your September VAT return isn't filed yet. It's due on 20 October."
    )
    assert not Notification.objects.exclude(organization=org).exists()


def test_paye_reminder_only_for_orgs_with_active_employees(team, org):
    Employee.objects.create(
        organization=org,
        first_name="A",
        last_name="B",
        gross_salary=Decimal("50000"),
        basic_salary=Decimal("50000"),
    )
    OrganizationFactory()  # no employees
    assert send_filing_reminders(today=date(2026, 1, 6)) == 1
    n = Notification.objects.filter(user=team["owner"]).get()
    assert n.title == "PAYE return due 9 January"
    assert "December PAYE" in n.body  # previous month crosses the year boundary


def test_no_reminders_on_other_days(org, team):
    org.vat_registration_number = "0123456A"
    org.save()
    assert send_filing_reminders(today=date(2026, 10, 18)) == 0
    assert not Notification.objects.exists()


# ── Scheduling ────────────────────────────────────────────────────────────────


def test_beat_schedule_tasks_are_registered():
    from hesabu.celery import app

    app.loader.import_default_modules()
    for entry in settings.CELERY_BEAT_SCHEDULE.values():
        assert entry["task"] in app.tasks, entry["task"]
