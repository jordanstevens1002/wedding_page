import math

from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import EditorAccount
from .security import IsEditor, locked_throttle


class TokenSerializer(serializers.Serializer):
    csrf_token = serializers.CharField()


class SessionSerializer(TokenSerializer):
    username = serializers.CharField()


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=1024, trim_whitespace=False, write_only=True)


class PasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=1024, trim_whitespace=False, write_only=True)
    new_password = serializers.CharField(max_length=1024, trim_whitespace=False, write_only=True)


@method_decorator(never_cache, name="dispatch")
class EditorView(APIView):
    permission_classes = [IsEditor]


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(EditorView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses=TokenSerializer, auth=[])
    def get(self, request):
        return Response({"csrf_token": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class LoginView(EditorView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=LoginSerializer, responses={200: SessionSerializer, 400: None, 429: None}, auth=[])
    def post(self, request):
        if settings.SESSION_COOKIE_SECURE and not request.is_secure():
            return Response({"detail": "HTTPS is required."}, status=400)
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with locked_throttle() as bucket:
            if bucket.attempts >= settings.EDITOR_LOGIN_MAX_ATTEMPTS:
                remaining = settings.EDITOR_LOGIN_WINDOW_SECONDS - (timezone.now() - bucket.started_at).total_seconds()
                return Response({"detail": "Try again later."}, status=429,
                                headers={"Retry-After": str(max(1, math.ceil(remaining)))})
            bucket.attempts += 1
            user = authenticate(request, **data.validated_data)
            if user is None or not EditorAccount.objects.filter(pk=1, user=user).exists():
                return Response({"detail": "Unable to sign in."}, status=400)
            bucket.attempts = 0
            login(request, user)
            request.session["editor_started_at"] = timezone.now().timestamp()
        return Response({"username": user.username, "csrf_token": get_token(request)})


class SessionView(EditorView):
    @extend_schema(responses=SessionSerializer)
    def get(self, request):
        return Response({"username": request.user.username, "csrf_token": get_token(request)})


class LogoutView(EditorView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request)
        return Response(status=204)


class PasswordView(EditorView):
    @extend_schema(request=PasswordSerializer, responses={200: SessionSerializer, 400: None})
    def post(self, request):
        data = PasswordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with locked_throttle():
            editor = EditorAccount.objects.select_related("user").get(pk=1)
            user = editor.user
            if request.user.get_session_auth_hash() != user.get_session_auth_hash():
                return Response({"detail": "Editor session expired."}, status=403)
            if not user.check_password(data.validated_data["current_password"]):
                return Response({"detail": "Unable to change password."}, status=400)
            try:
                validate_password(data.validated_data["new_password"], user=user)
            except ValidationError as error:
                return Response({"new_password": error.messages}, status=400)
            user.set_password(data.validated_data["new_password"])
            user.save(update_fields=["password"])
            # Keep this session; Django invalidates other sessions using the old hash.
            update_session_auth_hash(request, user)
        return Response({"username": user.username, "csrf_token": get_token(request)})
