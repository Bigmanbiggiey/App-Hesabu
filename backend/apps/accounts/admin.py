from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import Organization, User


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "kra_pin", "county", "subscription_tier", "subscription_status", "created_at"]
    search_fields = ["name", "kra_pin"]
    list_filter = ["subscription_tier", "subscription_status", "county"]


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ["email"]
    list_display = ["email", "first_name", "last_name", "role", "organization", "is_active"]
    search_fields = ["email", "first_name", "last_name"]
    list_filter = ["role", "is_active"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal", {"fields": ("first_name", "last_name", "phone_number", "language")}),
        ("Organization", {"fields": ("organization", "role")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {"fields": ("email", "password1", "password2", "first_name", "last_name", "organization", "role")}),
    )
