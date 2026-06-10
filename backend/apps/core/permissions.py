from rest_framework.permissions import BasePermission


class IsOrganizationOwner(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "owner"


class IsAccountant(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            "owner",
            "admin",
            "accountant",
        )
