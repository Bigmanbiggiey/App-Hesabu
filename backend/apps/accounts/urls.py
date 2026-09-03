from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenBlacklistView
from . import views

router = DefaultRouter()
router.register("team", views.TeamMemberViewSet, basename="team")

urlpatterns = [
    path("login/", views.LoginView.as_view(), name="login"),
    path("register/", views.RegisterView.as_view(), name="register"),
    path("logout/", TokenBlacklistView.as_view(), name="logout"),
    path("me/", views.me, name="me"),
    path("organization/", views.organization_detail, name="organization"),
    path("dashboard/stats/", views.dashboard_stats, name="dashboard-stats"),
    path("reports/", views.reports, name="reports"),
]

urlpatterns += router.urls
