from rest_framework.permissions import BasePermission

# Role hierarchy: owner > admin > accountant > staff
MANAGEMENT_ROLES = ("owner", "admin")
FINANCE_ROLES = ("owner", "admin", "accountant")


class IsOrganizationOwner(BasePermission):
    message = "Only the account owner may perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "owner"
        )


class IsOwnerOrAdmin(BasePermission):
    message = "Only account owners or admins may perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in MANAGEMENT_ROLES
        )


class IsAccountant(BasePermission):
    """Owners, admins and accountants — i.e. everyone except plain staff."""

    message = "You do not have permission to modify financial records."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in FINANCE_ROLES
        )
