from django.urls import path
from drf_spectacular.views import SpectacularAPIView

from .health import LiveView, ReadyView

urlpatterns = [
    path("api/health/live/", LiveView.as_view()),
    path("api/health/ready/", ReadyView.as_view()),
    path("api/schema/", SpectacularAPIView.as_view()),
]
