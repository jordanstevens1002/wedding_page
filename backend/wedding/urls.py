from django.urls import path
from drf_spectacular.views import SpectacularAPIView

from .health import LiveView, ReadyView
from .editor.views import CsrfView, LoginView, LogoutView, PasswordView, SessionView

urlpatterns = [
    path("api/editor/csrf/", CsrfView.as_view()),
    path("api/editor/login/", LoginView.as_view()),
    path("api/editor/logout/", LogoutView.as_view()),
    path("api/editor/password/", PasswordView.as_view()),
    path("api/editor/session/", SessionView.as_view()),
    path("api/health/live/", LiveView.as_view()),
    path("api/health/ready/", ReadyView.as_view()),
    path("api/schema/", SpectacularAPIView.as_view()),
]
