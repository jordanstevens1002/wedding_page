from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, close_old_connections, transaction
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from wedding.editor.models import EditorAccount, LoginThrottle

pytestmark = pytest.mark.django_db
PASSWORD = "Fictional!Editor!Pass123"
NEXT_PASSWORD = "Another!Fictional!Pass456"


@pytest.fixture
def editor():
    user = get_user_model().objects.create_user(username="editor", password=PASSWORD)
    EditorAccount.objects.create(user=user)
    return user


def token(client):
    response = client.get("/api/editor/csrf/", secure=True)
    assert response.status_code == 200
    return response.json()["csrf_token"]


def post(client, endpoint, data, csrf=None, **kwargs):
    return client.post(f"/api/editor/{endpoint}/", data, format="json", secure=True,
                       HTTP_ORIGIN="https://testserver", HTTP_X_CSRFTOKEN=csrf or token(client), **kwargs)


def signed_in():
    client = APIClient(enforce_csrf_checks=True)
    response = post(client, "login", {"username": "editor", "password": PASSWORD})
    assert response.status_code == 200
    return client, response


def operate(monkeypatch, operation, password=PASSWORD, **kwargs):
    monkeypatch.setattr("sys.stdin", StringIO(password + "\n"))
    output = StringIO()
    call_command("editor_account", operation, password_stdin=True, stdout=output, **kwargs)
    assert password not in output.getvalue()


def test_bootstrap_hashes_password_and_cannot_replace_existing_editor(monkeypatch):
    operate(monkeypatch, "bootstrap")
    user = EditorAccount.objects.get().user
    assert user.check_password(PASSWORD)
    assert user.password != PASSWORD
    assert not user.is_superuser
    with pytest.raises(CommandError, match="already configured"):
        operate(monkeypatch, "bootstrap", NEXT_PASSWORD)
    user.refresh_from_db()
    assert user.check_password(PASSWORD)


@pytest.mark.parametrize("password", ["", "short", "1234567890123456"])
def test_bootstrap_rejects_invalid_passwords_without_creating_accounts(monkeypatch, password):
    with pytest.raises(CommandError):
        operate(monkeypatch, "bootstrap", password)
    assert not EditorAccount.objects.exists()
    assert not get_user_model().objects.exists()


def test_recovery_requires_existing_account_and_private_input(monkeypatch):
    with pytest.raises(CommandError, match="No editor"):
        operate(monkeypatch, "recover")
    monkeypatch.setattr("sys.stdin", StringIO(PASSWORD))
    with pytest.raises(CommandError, match="interactive terminal"):
        call_command("editor_account", "bootstrap")


def test_single_editor_constraint_is_enforced_by_database(editor):
    other = get_user_model().objects.create_user(username="another")
    with pytest.raises(IntegrityError), transaction.atomic():
        EditorAccount.objects.create(pk=2, user=other)


def test_login_requires_csrf_even_for_anonymous_clients(editor):
    client = APIClient(enforce_csrf_checks=True)
    response = client.post("/api/editor/login/", {"username": "editor", "password": PASSWORD}, format="json", secure=True)
    assert response.status_code == 403
    assert not LoginThrottle.objects.exists()


def test_session_rotation_cookie_flags_and_logout(editor):
    client = APIClient(enforce_csrf_checks=True)
    session = client.session
    session["unrelated"] = "fictional"
    session.save()
    old_key = session.session_key
    csrf = token(client)
    old_csrf_cookie = client.cookies[settings.CSRF_COOKIE_NAME].value
    response = post(client, "login", {"username": "editor", "password": PASSWORD}, csrf)
    assert response.status_code == 200
    assert client.session.session_key != old_key
    assert response.json()["csrf_token"] != csrf
    assert client.cookies[settings.CSRF_COOKIE_NAME].value != old_csrf_cookie
    cookie = response.cookies[settings.SESSION_COOKIE_NAME]
    assert cookie["secure"] and cookie["httponly"] and cookie["samesite"] == "Lax"
    assert response["Cache-Control"].find("no-store") >= 0
    assert client.get("/api/editor/session/", secure=True).json()["username"] == "editor"
    assert client.post("/api/editor/logout/", secure=True).status_code == 403
    assert post(client, "logout", {}, response.json()["csrf_token"]).status_code == 204
    assert client.get("/api/editor/session/", secure=True).status_code == 403


def test_other_users_including_superusers_have_no_editor_access(editor):
    other = get_user_model().objects.create_superuser(username="other", password=PASSWORD)
    client = APIClient(enforce_csrf_checks=True)
    response = post(client, "login", {"username": other.username, "password": PASSWORD})
    unknown = post(client, "login", {"username": "unknown", "password": PASSWORD})
    assert response.status_code == unknown.status_code == 400
    assert response.json() == unknown.json()
    client.force_login(other)
    session = client.session
    session["editor_started_at"] = timezone.now().timestamp()
    session.save()
    assert client.get("/api/editor/session/", secure=True).status_code == 403


def test_inactive_editor_cannot_login(editor):
    editor.is_active = False
    editor.save()
    assert post(APIClient(enforce_csrf_checks=True), "login", {"username": "editor", "password": PASSWORD}).status_code == 400


@override_settings(EDITOR_LOGIN_MAX_ATTEMPTS=2)
def test_login_throttle_persists_across_clients_and_expires(editor):
    for _ in range(2):
        assert post(APIClient(enforce_csrf_checks=True), "login", {"username": "editor", "password": "wrong"}).status_code == 400
    response = post(APIClient(enforce_csrf_checks=True), "login", {"username": "editor", "password": PASSWORD})
    assert response.status_code == 429 and int(response["Retry-After"]) > 0
    LoginThrottle.objects.update(started_at=timezone.now() - timedelta(minutes=16))
    signed_in()
    assert LoginThrottle.objects.get().attempts == 0


@pytest.mark.django_db(transaction=True)
@override_settings(EDITOR_LOGIN_MAX_ATTEMPTS=2)
def test_concurrent_workers_cannot_lose_attempts(editor):
    def attempt(_):
        close_old_connections()
        try:
            return post(APIClient(enforce_csrf_checks=True), "login", {"username": "editor", "password": "wrong"}).status_code
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=3) as workers:
        statuses = list(workers.map(attempt, range(3)))
    assert sorted(statuses) == [400, 400, 429]
    assert LoginThrottle.objects.get().attempts == 2


def test_recovery_revokes_existing_sessions_and_clears_throttle(editor, monkeypatch):
    first, _ = signed_in()
    second, _ = signed_in()
    LoginThrottle.objects.update(attempts=99)
    operate(monkeypatch, "recover", NEXT_PASSWORD)
    for client in [first, second]:
        assert client.get("/api/editor/session/", secure=True).status_code == 403
    assert LoginThrottle.objects.get().attempts == 0
    assert post(APIClient(enforce_csrf_checks=True), "login", {"username": "editor", "password": NEXT_PASSWORD}).status_code == 200


def test_password_change_validates_old_and_new_password_and_revokes_other_sessions(editor):
    first, _ = signed_in()
    second, _ = signed_in()
    assert post(first, "password", {"current_password": "wrong", "new_password": NEXT_PASSWORD}).status_code == 400
    assert post(first, "password", {"current_password": PASSWORD, "new_password": "short"}).status_code == 400
    response = post(first, "password", {"current_password": PASSWORD, "new_password": NEXT_PASSWORD})
    assert response.status_code == 200
    assert first.get("/api/editor/session/", secure=True).status_code == 200
    assert second.get("/api/editor/session/", secure=True).status_code == 403


def test_absolute_expiry_is_independent_of_recent_activity(editor):
    client, _ = signed_in()
    session = client.session
    session["editor_started_at"] = (timezone.now() - timedelta(hours=13)).timestamp()
    session.save()
    assert client.get("/api/editor/session/", secure=True).status_code == 403


def test_idle_expiry_rejects_a_still_present_browser_cookie(editor):
    from django.contrib.sessions.models import Session
    client, _ = signed_in()
    Session.objects.filter(session_key=client.session.session_key).update(expire_date=timezone.now() - timedelta(seconds=1))
    assert client.get("/api/editor/session/", secure=True).status_code == 403


def test_plain_http_and_spoofed_proxy_header_are_rejected_by_default(editor):
    client = APIClient(enforce_csrf_checks=True)
    csrf = token(client)
    response = client.post("/api/editor/login/", {"username": "editor", "password": PASSWORD}, format="json",
                           HTTP_X_CSRFTOKEN=csrf, HTTP_X_FORWARDED_PROTO="https")
    assert response.status_code == 400
    assert "HTTPS" in response.json()["detail"]


@override_settings(SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"))
@pytest.mark.parametrize("host", ["testserver", "testserver:8443"])
def test_explicit_proxy_trust_recognises_https(editor, host):
    client = APIClient(enforce_csrf_checks=True)
    response = client.post("/api/editor/login/", {"username": "editor", "password": PASSWORD}, format="json",
                           HTTP_X_CSRFTOKEN=token(client), HTTP_ORIGIN=f"https://{host}",
                           HTTP_HOST=host, HTTP_X_FORWARDED_PROTO="https")
    assert response.status_code == 200
