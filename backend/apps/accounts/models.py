import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models, transaction
from apps.core.models import BaseModel


class SubscriptionTier(models.TextChoices):
    BIASHARA = "biashara", "Biashara (KSh 2,500/mo)"
    KAMPUNI = "kampuni", "Kampuni (KSh 6,500/mo)"
    SHIRIKA = "shirika", "Shirika (KSh 15,000/mo)"


class SubscriptionStatus(models.TextChoices):
    TRIAL = "trial", "Trial"
    ACTIVE = "active", "Active"
    PAST_DUE = "past_due", "Past Due"
    CANCELLED = "cancelled", "Cancelled"


class KenyanCounty(models.TextChoices):
    NAIROBI = "nairobi", "Nairobi"
    MOMBASA = "mombasa", "Mombasa"
    KISUMU = "kisumu", "Kisumu"
    NAKURU = "nakuru", "Nakuru"
    ELDORET = "eldoret", "Eldoret (Uasin Gishu)"
    KIAMBU = "kiambu", "Kiambu"
    MACHAKOS = "machakos", "Machakos"
    NYERI = "nyeri", "Nyeri"
    MERU = "meru", "Meru"
    KISII = "kisii", "Kisii"
    OTHER = "other", "Other"


class Organization(BaseModel):
    """A GC firm / tenant. All business data is scoped to an Organization."""

    name = models.CharField(max_length=255)
    kra_pin = models.CharField(
        max_length=11,
        unique=True,
        help_text="KRA Personal Identification Number (e.g. A000000000B)",
    )
    vat_registration_number = models.CharField(max_length=50, blank=True)
    etims_device_serial = models.CharField(max_length=100, blank=True)
    etims_branch_id = models.CharField(max_length=10, blank=True, default="00")

    # M-Pesa
    mpesa_paybill_number = models.CharField(max_length=10, blank=True)
    mpesa_till_number = models.CharField(max_length=10, blank=True)
    mpesa_account_reference = models.CharField(max_length=20, blank=True)

    # Location
    county = models.CharField(
        max_length=50, choices=KenyanCounty.choices, default=KenyanCounty.NAIROBI
    )
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    logo = models.ImageField(upload_to="logos/", blank=True, null=True)

    # Subscription
    subscription_tier = models.CharField(
        max_length=20,
        choices=SubscriptionTier.choices,
        default=SubscriptionTier.BIASHARA,
    )
    subscription_status = models.CharField(
        max_length=20,
        choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.TRIAL,
    )
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    subscription_ends_at = models.DateTimeField(null=True, blank=True)

    # Invoice settings
    invoice_prefix = models.CharField(max_length=10, default="INV")
    invoice_sequence = models.PositiveIntegerField(default=0)
    default_vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=16.00)
    default_payment_terms_days = models.PositiveIntegerField(default=30)

    class Meta:
        db_table = "organizations"

    def __str__(self):
        return f"{self.name} ({self.kra_pin})"

    def next_invoice_number(self):
        """
        Atomically allocate the next invoice number. The row is locked with
        SELECT ... FOR UPDATE so two concurrent invoice creations cannot read
        the same sequence value and collide on the
        (organization, invoice_number) unique constraint.
        """
        with transaction.atomic():
            org = Organization.objects.select_for_update().get(pk=self.pk)
            org.invoice_sequence += 1
            org.save(update_fields=["invoice_sequence"])
        self.invoice_sequence = org.invoice_sequence
        return f"{org.invoice_prefix}-{org.invoice_sequence:05d}"


class UserRole(models.TextChoices):
    OWNER = "owner", "Owner"
    ADMIN = "admin", "Admin"
    ACCOUNTANT = "accountant", "Accountant"
    STAFF = "staff", "Staff"


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", UserRole.OWNER)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, BaseModel):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=20, blank=True)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.STAFF)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="users",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    language = models.CharField(max_length=5, default="en", choices=[("en", "English"), ("sw", "Kiswahili")])

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        db_table = "users"

    def __str__(self):
        return f"{self.get_full_name()} <{self.email}>"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()
