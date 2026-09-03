"""Invoice numbers must be unique under concurrency (report #9)."""
import pytest

from apps.accounts.models import Organization
from tests.factories import OrganizationFactory

pytestmark = pytest.mark.django_db


def test_sequential_and_formatted(organization):
    numbers = [organization.next_invoice_number() for _ in range(50)]
    assert numbers == [f"INV-{i:05d}" for i in range(1, 51)]
    organization.refresh_from_db()
    assert organization.invoice_sequence == 50


def test_reads_committed_sequence_not_stale_instance(organization):
    """Two in-memory handles on the same org must not hand out the same number."""
    a = Organization.objects.get(pk=organization.pk)
    b = Organization.objects.get(pk=organization.pk)

    issued = []
    for handle in (a, b, a, b, a):
        issued.append(handle.next_invoice_number())

    assert len(set(issued)) == 5
    assert issued == sorted(issued)


@pytest.mark.postgres
@pytest.mark.django_db(transaction=True)
def test_concurrent_allocation_has_no_duplicates():
    import threading

    org = OrganizationFactory()
    results = []
    errors = []

    def worker():
        from django.db import connection

        try:
            results.append(org.next_invoice_number())
        except Exception as exc:  # pragma: no cover - only on failure
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=worker) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert len(set(results)) == 20
