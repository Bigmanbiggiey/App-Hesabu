"""Shared test factories."""
from datetime import date, timedelta
from decimal import Decimal

import factory
from django.contrib.auth import get_user_model

from apps.accounts.models import Organization
from apps.invoices.models import Customer, Invoice, InvoiceLineItem

User = get_user_model()


class OrganizationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Organization

    name = factory.Sequence(lambda n: f"Org {n}")
    kra_pin = factory.Sequence(lambda n: f"P{n:09d}Z")
    subscription_tier = "kampuni"
    subscription_status = "active"


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    first_name = "Test"
    last_name = factory.Sequence(lambda n: f"User{n}")
    role = "owner"
    organization = factory.SubFactory(OrganizationFactory)

    @factory.post_generation
    def password(obj, create, extracted, **kwargs):
        obj.set_password(extracted or "pass12345")
        if create:
            obj.save()


class CustomerFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Customer

    organization = factory.SubFactory(OrganizationFactory)
    name = factory.Sequence(lambda n: f"Customer {n}")
    kra_pin = factory.Sequence(lambda n: f"C{n:09d}X")


class InvoiceFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Invoice

    organization = factory.SubFactory(OrganizationFactory)
    customer = factory.SubFactory(
        CustomerFactory,
        organization=factory.SelfAttribute("..organization"),
    )
    invoice_number = factory.Sequence(lambda n: f"INV-{n:05d}")
    invoice_date = factory.LazyFunction(date.today)
    due_date = factory.LazyFunction(lambda: date.today() + timedelta(days=30))
    status = "sent"


class InvoiceLineItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = InvoiceLineItem

    invoice = factory.SubFactory(InvoiceFactory)
    description = "Consulting"
    quantity = Decimal("1")
    unit_price = Decimal("1000.00")
    vat_class = "standard"
