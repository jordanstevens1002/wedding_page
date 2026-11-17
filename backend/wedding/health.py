from django.db import DatabaseError, connection
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["ok", "unavailable"])


class LiveView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=HealthSerializer, auth=[])
    def get(self, request):
        return Response({"status": "ok"})


class ReadyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses={200: HealthSerializer, 503: HealthSerializer}, auth=[])
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                # Readiness requires both a connection and the migrated session table.
                cursor.execute("SELECT 1 FROM django_session LIMIT 1")
        except DatabaseError:
            return Response({"status": "unavailable"}, status=503)
        return Response({"status": "ok"})
