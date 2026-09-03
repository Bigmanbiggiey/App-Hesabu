"""Throttling, the team endpoint + seat limits (report #8, #Low)."""
import pytest

from apps.accounts.models import User
from tests.factories import OrganizationFactory, UserFactory

pytestmark = pytest.mark.django_db


# ── Throttling (#8) ─────────────────────────────────────────────────────────

def test_login_endpoint_is_rate_limited(api_client):
    # test settings: auth scope = 5/min
    last = None
    for _ in range(7):
        last = api_client.post(
            "/api/v1/auth/login/",
            {"email": "nobody@example.com", "password": "wrong"},
            format="json",
        )
    assert last.status_code == 429


def test_register_endpoint_is_rate_limited(api_client):
    # test settings: register scope = 3/hour
    codes = []
    for i in range(5):
        resp = api_client.post(
            "/api/v1/auth/register/",
            {
                "email": f"reg{i}@example.com",
                "password": "s3cretpass",
                "first_name": "R",
                "last_name": str(i),
                "organization_name": f"Org {i}",
                "kra_pin": f"R{i:09d}Z",
            },
            format="json",
        )
        codes.append(resp.status_code)
    assert codes[:3] == [201, 201, 201]
    assert 429 in codes[3:]


# ── Team endpoint (#Low: wires check_user_limit) ────────────────────────────

@pytest.fixture
def owner_client(make_auth_client):
    org = OrganizationFactory(subscription_tier="biashara")  # 5-seat cap
    owner = UserFactory(organization=org, role="owner")
    return make_auth_client(owner), org, owner


def _invite(client, email="new@example.com", role="staff"):
    return client.post(
        "/api/v1/auth/team/",
        {
            "email": email,
            "password": "s3cretpass",
            "first_name": "New",
            "last_name": "Hire",
            "role": role,
        },
        format="json",
    )


def test_owner_can_invite_member(owner_client):
    client, org, _ = owner_client
    resp = _invite(client)
    assert resp.status_code == 201
    assert resp.json()["role"] == "staff"
    u = User.objects.get(email="new@example.com")
    assert u.organization_id == org.id and u.check_password("s3cretpass")


def test_staff_cannot_invite(make_auth_client):
    org = OrganizationFactory()
    staff = UserFactory(organization=org, role="staff")
    resp = _invite(make_auth_client(staff))
    assert resp.status_code == 403


def test_seat_limit_enforced(owner_client):
    client, org, _ = owner_client
    # org already has the owner; biashara cap is 5 -> 4 more succeed, 5th fails
    for i in range(4):
        assert _invite(client, email=f"seat{i}@example.com").status_code == 201
    resp = _invite(client, email="overflow@example.com")
    assert resp.status_code == 403
    assert "plan allows 5 users" in str(resp.content)


def test_cannot_change_own_role(owner_client):
    client, org, owner = owner_client
    resp = client.patch(
        f"/api/v1/auth/team/{owner.id}/", {"role": "staff"}, format="json"
    )
    assert resp.status_code == 403


def test_cannot_modify_owner(owner_client):
    client, org, _ = owner_client
    other_owner = UserFactory(organization=org, role="owner")
    resp = client.patch(
        f"/api/v1/auth/team/{other_owner.id}/", {"is_active": False}, format="json"
    )
    assert resp.status_code == 403


def test_owner_can_change_member_role_and_status(owner_client):
    client, org, _ = owner_client
    member = UserFactory(organization=org, role="staff")
    resp = client.patch(
        f"/api/v1/auth/team/{member.id}/",
        {"role": "accountant", "is_active": False},
        format="json",
    )
    assert resp.status_code == 200
    member.refresh_from_db()
    assert member.role == "accountant" and member.is_active is False


def test_team_list_still_available_to_any_member(make_auth_client):
    org = OrganizationFactory()
    UserFactory(organization=org, role="staff", email="a@example.com")
    staff = UserFactory(organization=org, role="staff", email="b@example.com")
    resp = make_auth_client(staff).get("/api/v1/auth/team/")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2
