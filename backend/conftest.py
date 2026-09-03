"""Project-wide pytest fixtures."""
import pytest
from rest_framework.test import APIClient

from tests.factories import (
    CustomerFactory,
    InvoiceFactory,
    OrganizationFactory,
    UserFactory,
)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def organization(db):
    return OrganizationFactory()


@pytest.fixture
def user(db, organization):
    return UserFactory(organization=organization, role="owner")


@pytest.fixture
def other_organization(db):
    return OrganizationFactory()


@pytest.fixture
def other_user(db, other_organization):
    return UserFactory(organization=other_organization, role="owner")


@pytest.fixture
def auth_client(db, user):
    """APIClient authenticated as ``user`` (bypasses the JWT handshake)."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def customer(db, organization):
    return CustomerFactory(organization=organization)


@pytest.fixture
def invoice(db, organization, customer):
    return InvoiceFactory(organization=organization, customer=customer)


@pytest.fixture
def make_auth_client(db):
    """Factory fixture: build an APIClient for an arbitrary user."""
    def _make(user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    return _make
