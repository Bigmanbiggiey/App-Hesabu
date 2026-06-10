from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, Organization


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id", "name", "kra_pin", "vat_registration_number",
            "etims_device_serial", "etims_branch_id",
            "mpesa_paybill_number", "mpesa_till_number", "mpesa_account_reference",
            "county", "address", "phone", "email", "website", "logo",
            "subscription_tier", "subscription_status",
            "trial_ends_at", "subscription_ends_at",
            "invoice_prefix", "default_vat_rate", "default_payment_terms_days",
            "created_at",
        ]
        read_only_fields = [
            "id", "kra_pin",
            "subscription_tier", "subscription_status",
            "trial_ends_at", "subscription_ends_at",
            "created_at",
        ]


class UserSerializer(serializers.ModelSerializer):
    organization = OrganizationSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "phone_number", "role", "organization", "language", "created_at",
        ]
        read_only_fields = ["id", "email", "role", "created_at"]

    def get_full_name(self, obj):
        return obj.get_full_name()


class UpdateUserSerializer(serializers.ModelSerializer):
    """Allows users to update their own profile (name, phone, language)."""

    class Meta:
        model = User
        fields = ["first_name", "last_name", "phone_number", "language"]


class TeamMemberSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "full_name",
                  "role", "phone_number", "is_active", "created_at"]
        read_only_fields = fields

    def get_full_name(self, obj):
        return obj.get_full_name()


class RegisterSerializer(serializers.Serializer):
    # User fields
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone_number = serializers.CharField(max_length=20, required=False)

    # Organization fields
    organization_name = serializers.CharField(max_length=255)
    kra_pin = serializers.CharField(max_length=11)
    county = serializers.CharField(max_length=50, required=False, default="nairobi")

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_kra_pin(self, value):
        value = value.upper()
        if Organization.objects.filter(kra_pin=value).exists():
            raise serializers.ValidationError("An organization with this KRA PIN already exists.")
        return value

    def create(self, validated_data):
        from django.utils import timezone
        from datetime import timedelta

        org = Organization.objects.create(
            name=validated_data["organization_name"],
            kra_pin=validated_data["kra_pin"],
            county=validated_data.get("county", "nairobi"),
            trial_ends_at=timezone.now() + timedelta(days=14),
        )
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
            phone_number=validated_data.get("phone_number", ""),
            role="owner",
            organization=org,
        )
        return user


class HesabuTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Augments the JWT payload with user details."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["email"] = user.email
        token["full_name"] = user.get_full_name()
        token["role"] = user.role
        if user.organization:
            token["organization_id"] = str(user.organization.id)
            token["organization_name"] = user.organization.name
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
