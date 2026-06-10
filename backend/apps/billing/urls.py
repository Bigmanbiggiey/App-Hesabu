from django.urls import path
from . import views

urlpatterns = [
    path("status/",           views.billing_status,     name="billing-status"),
    path("mpesa/initiate/",   views.mpesa_initiate,     name="billing-mpesa-initiate"),
    path("mpesa/callback/",   views.mpesa_callback,     name="billing-mpesa-callback"),
    path("stripe/checkout/",  views.stripe_checkout,    name="billing-stripe-checkout"),
    path("stripe/webhook/",   views.stripe_webhook,     name="billing-stripe-webhook"),
    path("cancel/",           views.cancel_subscription, name="billing-cancel"),
    path("history/",          views.billing_history,    name="billing-history"),
]
