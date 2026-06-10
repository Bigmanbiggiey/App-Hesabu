from django.utils.functional import SimpleLazyObject


def get_organization(request):
    if not hasattr(request, "_cached_organization"):
        if request.user.is_authenticated:
            request._cached_organization = request.user.organization
        else:
            request._cached_organization = None
    return request._cached_organization


class OrganizationMiddleware:
    """Attaches the authenticated user's organization to every request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.organization = SimpleLazyObject(lambda: get_organization(request))
        return self.get_response(request)
