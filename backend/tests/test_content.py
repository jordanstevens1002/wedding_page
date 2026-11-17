from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from io import StringIO
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, close_old_connections, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from wedding.content.models import SiteRevision, WebsiteState
from wedding.content.services import DraftConflict, blank_document, read_draft, save_draft
from wedding.editor.models import EditorAccount

pytestmark = pytest.mark.django_db
PRIVATE = "/api/editor/site/draft/"


@pytest.fixture
def editor():
    user = get_user_model().objects.create_user(username="fictional-editor")
    EditorAccount.objects.create(user=user)
    return user


@pytest.fixture
def client(editor):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(editor)
    session = client.session
    session["editor_started_at"] = timezone.now().timestamp()
    session.save()
    token = client.get("/api/editor/csrf/", secure=True).json()["csrf_token"]
    client.credentials(HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN="https://testserver")
    return client


def put(client, document, base=0, **extra):
    return client.put(PRIVATE, {"base_revision": base, "document": document, **extra}, format="json", secure=True)


def test_fresh_public_and_private_reads_do_not_seed_content(client):
    public = APIClient().get("/api/site/")
    assert public.status_code == 200
    assert public.json() == {"configured": False, "document": None}
    private = client.get(PRIVATE, secure=True).json()
    assert private == {"revision": 0, "document": blank_document()}
    assert not WebsiteState.objects.exists()
    assert not SiteRevision.objects.exists()


def test_save_reload_and_reorder_keep_ids_and_append_new_revisions(client):
    document = blank_document()
    document["title"] = "Fictional private wedding"
    document["wedding_date"] = "2030-01-01"
    entry_id = str(uuid4())
    document["sections"][2]["entries"] = [{"id": entry_id, "title": "Fictional ceremony",
                                             "starts_at": "2030-01-01T10:00:00+11:00"}]
    first = put(client, document)
    assert first.status_code == 200
    saved = first.json()
    assert saved["document"]["sections"][2]["entries"][0]["starts_at"] == "2029-12-31T23:00:00Z"
    assert client.get(PRIVATE, secure=True).json() == saved
    reordered = deepcopy(saved["document"])
    reordered["sections"].reverse()
    second = put(client, reordered, saved["revision"])
    assert second.status_code == 200
    assert [s["id"] for s in second.json()["document"]["sections"]] == [s["id"] for s in reordered["sections"]]
    assert SiteRevision.objects.count() == 2
    assert SiteRevision.objects.get(pk=saved["revision"]).document == saved["document"]


def test_drafts_do_not_leak_or_automatically_publish(client):
    document = blank_document()
    document["title"] = "Private draft marker"
    document["sections"][0]["visible"] = True
    assert put(client, document).status_code == 200
    public = APIClient().get("/api/site/")
    assert public.json() == {"configured": False, "document": None}
    assert "Private draft marker" not in public.content.decode()
    assert WebsiteState.objects.get().published_id is None
    assert "no-store" in client.get(PRIVATE, secure=True)["Cache-Control"]


def test_public_reads_only_published_snapshot_and_excludes_hidden_sections(client):
    document = blank_document()
    document["title"] = "Fictional published title"
    document["sections"][0].update(visible=True, body="Fictional public welcome")
    document["sections"][1]["body"] = "Hidden private section marker"
    first = put(client, document).json()
    # Simulate a publication fixture; no publish endpoint is introduced in this slice.
    WebsiteState.objects.filter(pk=1).update(published_id=first["revision"])
    document["title"] = "New private draft marker"
    assert put(client, document, first["revision"]).status_code == 200
    public = APIClient().get("/api/site/").json()
    assert public["configured"] is True
    assert public["document"]["title"] == "Fictional published title"
    assert [s["id"] for s in public["document"]["sections"]] == ["welcome"]
    assert "Hidden private section marker" not in str(public)
    assert set(public) == {"configured", "document"}
    assert "created_by" not in str(public)


@pytest.mark.parametrize("field,value", [("timezone", "Not/AZone"), ("wedding_date", "not-a-date"),
                                         ("schema_version", 99), ("title", ""), ("title", "x" * 141)])
def test_invalid_document_fields_leave_no_partial_state(client, field, value):
    document = blank_document()
    document[field] = value
    assert put(client, document).status_code == 400
    assert not WebsiteState.objects.exists()
    assert not SiteRevision.objects.exists()


@pytest.mark.parametrize("mode", ["missing", "duplicate", "unknown", "extra", "url", "entry_id", "duplicate_entries", "large", "naive_time", "invalid_time"])
def test_invalid_sections_and_entries_are_rejected(client, mode):
    document = blank_document()
    section = document["sections"][0]
    entry = {"id": str(uuid4()), "title": "Fictional entry"}
    if mode == "missing": document["sections"].pop()
    elif mode == "duplicate": document["sections"][-1] = deepcopy(section)
    elif mode == "unknown": section["id"] = "private_guests"
    elif mode == "extra": section["published"] = True
    elif mode == "url": entry["url"] = "javascript:alert(1)"
    elif mode == "entry_id": entry["id"] = "not-a-uuid"
    elif mode == "duplicate_entries": section["entries"] = [entry, deepcopy(entry)]
    elif mode == "large": section["entries"] = [{**entry, "id": str(uuid4()), "body": "界" * 4000} for _ in range(30)]
    elif mode == "naive_time": entry["starts_at"] = "2030-01-01T10:00:00"
    elif mode == "invalid_time": entry["starts_at"] = "2030-99-99T10:00:00Z"
    if mode in {"url", "entry_id", "naive_time", "invalid_time"}: section["entries"] = [entry]
    assert put(client, document).status_code == 400
    assert not SiteRevision.objects.exists()


def test_private_apis_require_editor_and_csrf_and_cannot_set_publication(client):
    anonymous = APIClient(enforce_csrf_checks=True)
    assert anonymous.get(PRIVATE, secure=True).status_code == 403
    assert put(anonymous, blank_document()).status_code == 403
    client.credentials()  # Remove CSRF header while retaining the authenticated cookie.
    assert put(client, blank_document()).status_code == 403
    assert not SiteRevision.objects.exists()


def test_metadata_and_partial_updates_cannot_bypass_draft_contract(client):
    assert put(client, blank_document(), published=1).status_code == 400
    document = blank_document()
    document["created_by"] = 1
    assert put(client, document).status_code == 400
    assert client.patch(PRIVATE, {"title": "Unexpected"}, format="json", secure=True).status_code == 405
    assert not WebsiteState.objects.exists()


def test_stale_revision_conflicts_without_writing_another_snapshot(client):
    first = put(client, blank_document()).json()
    stale = put(client, blank_document())
    assert stale.status_code == 409
    assert stale.json()["revision"] == first["revision"]
    assert SiteRevision.objects.count() == 1


def test_revision_history_is_append_only_through_normal_orm_operations(editor):
    result = save_draft(document=blank_document(), base_revision=0, actor=editor)
    revision = SiteRevision.objects.get(pk=result["revision"])
    revision.document["title"] = "Attempted overwrite"
    with pytest.raises(ValidationError): revision.save()
    with pytest.raises(ValidationError): revision.delete()
    with pytest.raises(ValidationError): SiteRevision.objects.update(document={})
    with pytest.raises(ValidationError): SiteRevision.objects.all().delete()
    assert SiteRevision.objects.get(pk=revision.pk).document["title"] == "Wedding details"
    with pytest.raises(IntegrityError), transaction.atomic(): WebsiteState.objects.create(pk=2)


@pytest.mark.django_db(transaction=True)
def test_concurrent_first_saves_have_one_winner_without_lost_updates(editor):
    actor_id = editor.pk
    def save(title):
        close_old_connections()
        try:
            document = blank_document()
            document["title"] = title
            actor = get_user_model().objects.get(pk=actor_id)
            try:
                return save_draft(document=document, base_revision=0, actor=actor)["revision"]
            except DraftConflict:
                return None
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as workers:
        results = list(workers.map(save, ["Fictional first", "Fictional second"]))
    assert sum(result is not None for result in results) == 1
    assert SiteRevision.objects.count() == 1
    assert read_draft()["revision"] == next(result for result in results if result is not None)


def test_examples_are_opt_in_private_and_do_not_replace_existing_drafts(editor):
    output = StringIO()
    call_command("example_site_draft", stdout=output)
    assert "Nothing was published" in output.getvalue()
    assert read_draft()["document"]["title"] == "Fictional demonstration wedding"
    assert APIClient().get("/api/site/").json() == {"configured": False, "document": None}
    with pytest.raises(CommandError, match="will not be replaced"):
        call_command("example_site_draft", stdout=StringIO())
    assert SiteRevision.objects.count() == 1


def test_example_requires_an_explicitly_configured_editor():
    with pytest.raises(CommandError, match="Bootstrap"):
        call_command("example_site_draft", stdout=StringIO())
    assert not SiteRevision.objects.exists()
