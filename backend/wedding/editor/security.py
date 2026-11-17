from contextlib import contextmanager
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission

from .models import EditorAccount, LoginThrottle


@contextmanager
def locked_throttle():
    # Both creation and updates are serialised by PostgreSQL, across all workers.
    with transaction.atomic():
        LoginThrottle.objects.get_or_create(pk=1)
        bucket = LoginThrottle.objects.select_for_update().get(pk=1)
        if timezone.now() >= bucket.started_at + timedelta(seconds=settings.EDITOR_LOGIN_WINDOW_SECONDS):
            bucket.started_at = timezone.now()
            bucket.attempts = 0
        yield bucket
        bucket.save()


class IsEditor(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.is_active
                    and EditorAccount.objects.filter(pk=1, user=request.user).exists())


class EditorSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        if settings.SESSION_COOKIE_SECURE and not request.is_secure():
            raise AuthenticationFailed("HTTPS is required.")
        result = super().authenticate(request)
        if result is None:
            return None
        started = request.session.get("editor_started_at")
        if not isinstance(started, (int, float)) or timezone.now().timestamp() - started >= settings.EDITOR_SESSION_ABSOLUTE_SECONDS:
            request.session.flush()
            raise AuthenticationFailed("Editor session expired.")
        return result


class EditorSessionScheme(OpenApiAuthenticationExtension):
    target_class = "wedding.editor.security.EditorSessionAuthentication"
    name = "cookieAuth"

    def get_security_definition(self, auto_schema):
        return {"type": "apiKey", "in": "cookie", "name": settings.SESSION_COOKIE_NAME}
