from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("periods", views.TaxPeriodViewSet, basename="tax-period")
router.register("vat-returns", views.VATReturnViewSet, basename="vat-return")
router.register("employees", views.EmployeeViewSet, basename="employee")
router.register("paye-returns", views.PAYEReturnViewSet, basename="paye-return")

urlpatterns = [path("", include(router.urls))]
