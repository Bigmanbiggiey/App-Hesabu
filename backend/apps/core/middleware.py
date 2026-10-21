from django.utils.functional import SimpleLazyObject
from rest_framework.exceptions import PermissionDenied


class NoOrganization(PermissionDenied):
    default_detail = (
        "Your account is not linked to an organisation. Sign up through the app "
        "to create one, or ask your organisation's owner to invite you."
    )
    default_code = "no_organization"


def get_organization(request):
    if not hasattr(request, "_cached_organization"):
        if request.user.is_authenticated:
            request._cached_organization = request.user.organization
        else:
            request._cached_organization = None
    # An authenticated user without an organisation (e.g. one made with
    # `createsuperuser`) would otherwise hand a lazy None to every
    # `filter(organization=...)` and crash the view with a 500. Fail closed
    # with a 403 instead, for every org-scoped view at once.
    if request._cached_organization is None and request.user.is_authenticated:
        raise NoOrganization()
    return request._cached_organization


class OrganizationMiddleware:
    """Attaches the authenticated user's organization to every request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.organization = SimpleLazyObject(lambda: get_organization(request))
        return self.get_response(request)
