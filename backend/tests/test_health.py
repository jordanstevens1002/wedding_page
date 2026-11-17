from unittest.mock import patch

import pytest
from django.db import OperationalError
from rest_framework.test import APIClient


def test_liveness_needs_no_database():
    response = APIClient().get("/api/health/live/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_readiness_checks_the_migrated_database():
    response = APIClient().get("/api/health/ready/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_database_failure_is_unavailable_without_leaking_connection_details():
    with patch("wedding.health.connection.cursor", side_effect=OperationalError("private detail")):
        response = APIClient().get("/api/health/ready/")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


def test_schema_contains_health_contract_and_failure_status():
    response = APIClient().get("/api/schema/?format=json")
    assert response.status_code == 200
    schema = response.json()
    assert "503" in schema["paths"]["/api/health/ready/"]["get"]["responses"]
    assert schema["components"]["schemas"]["Health"]["required"] == ["status"]


def test_unknown_api_routes_do_not_serve_a_frontend_page():
    assert APIClient().get("/api/unknown/").status_code == 404
