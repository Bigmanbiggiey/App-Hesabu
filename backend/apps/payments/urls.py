from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("mpesa/transactions", views.MpesaTransactionViewSet, basename="mpesa-transaction")
router.register("", views.PaymentViewSet, basename="payment")

urlpatterns = [
    path("mpesa/callback/", views.mpesa_c2b_callback, name="mpesa-callback"),
    path("", include(router.urls)),
]
