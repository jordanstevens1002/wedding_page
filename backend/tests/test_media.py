from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, close_old_connections
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from wedding.content.models import WebsiteState
from wedding.content.services import blank_document, save_draft
from wedding.editor.models import EditorAccount
from wedding.media import services
from wedding.media.models import Asset, AssetReference

pytestmark = pytest.mark.django_db
LIBRARY = "/api/editor/media/"


@pytest.fixture(autouse=True)
def media_root(tmp_path):
    with override_settings(MEDIA_ROOT=tmp_path):
        yield tmp_path


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
    csrf = client.get("/api/editor/csrf/", secure=True).json()["csrf_token"]
    client.credentials(HTTP_X_CSRFTOKEN=csrf, HTTP_ORIGIN="https://testserver")
    return client


def photo(format="JPEG", size=(64, 32), exif=None):
    data = BytesIO()
    with Image.new("RGB", size, "#447755") as image:
        image.save(data, format=format, **({"exif": exif} if exif is not None else {}))
    return SimpleUploadedFile("../../fictional-photo.jpg", data.getvalue(), content_type="text/plain")


def upload(client, **kwargs):
    response = client.post(LIBRARY, {"file": photo(**kwargs)}, format="multipart", secure=True)
    assert response.status_code == 201
    return response.json()


def reference(asset, **kwargs):
    return {"asset_id": str(asset.pk), "alt_text": "Fictional green test image", **kwargs}


def document_with(asset, visible=True):
    document = blank_document()
    document["sections"][0].update(visible=visible, image=reference(asset))
    return document


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP"])
def test_actual_formats_override_declared_mime_and_filenames_are_not_persisted(client, media_root, format):
    result = upload(client, format=format)
    assert result["width"] == 64 and result["height"] == 32
    assert "filename" not in result and "created_by" not in result
    asset = Asset.objects.get(pk=result["id"])
    files = list(media_root.rglob("*.webp"))
    assert len(files) == 1
    assert files[0].parent.name == asset.pk.hex
    assert list(media_root.rglob("*.jpg")) == []
    with Image.open(files[0]) as image:
        assert image.format == "WEBP" and image.size == (64, 32)
    assert client.get(LIBRARY, secure=True).json()["results"][0]["id"] == result["id"]


def test_orientation_metadata_removal_and_responsive_sizes(client, media_root):
    exif = Image.Exif()
    exif[274] = 6
    exif[315] = "Fictional private metadata"
    result = upload(client, size=(2000, 1000), exif=exif)
    assert (result["width"], result["height"]) == (1000, 2000)
    assert [v["width"] for v in result["variants"]] == [640, 1000]
    for file in media_root.rglob("*.webp"):
        with Image.open(file) as image:
            assert not image.getexif()
            assert not {"exif", "icc_profile", "xmp"}.intersection(image.info)


@pytest.mark.parametrize("data", [b"not an image", b"<svg onload='alert(1)'/>", b"\xff\xd8\xffbroken"])
def test_invalid_and_truncated_uploads_leave_no_records_or_files(client, media_root, data):
    response = client.post(LIBRARY, {"file": SimpleUploadedFile("fake.jpg", data, content_type="image/jpeg")}, format="multipart", secure=True)
    assert response.status_code == 400
    assert not Asset.objects.exists()
    assert not list(media_root.iterdir())


def test_byte_pixel_and_animation_limits(client, media_root, monkeypatch):
    monkeypatch.setattr(services, "MAX_BYTES", 10)
    assert client.post(LIBRARY, {"file": photo()}, format="multipart", secure=True).status_code == 400
    monkeypatch.setattr(services, "MAX_BYTES", 16 * 1024 * 1024)
    with patch.object(Image, "MAX_IMAGE_PIXELS", 10):
        assert client.post(LIBRARY, {"file": photo()}, format="multipart", secure=True).status_code == 400
    data = BytesIO()
    with Image.new("RGB", (8, 8), "red") as first, Image.new("RGB", (8, 8), "blue") as second:
        first.save(data, format="WEBP", save_all=True, append_images=[second], duration=100)
    assert client.post(LIBRARY, {"file": SimpleUploadedFile("animated.webp", data.getvalue())}, format="multipart", secure=True).status_code == 400
    assert not Asset.objects.exists() and not list(media_root.iterdir())


def test_editor_and_csrf_are_required_for_library_and_upload(client):
    anonymous = APIClient(enforce_csrf_checks=True)
    assert anonymous.get(LIBRARY, secure=True).status_code == 403
    assert anonymous.post(LIBRARY, {"file": photo()}, format="multipart", secure=True).status_code == 403
    client.credentials()
    assert client.post(LIBRARY, {"file": photo()}, format="multipart", secure=True).status_code == 403


def test_only_visible_current_publication_assets_are_public(client, editor):
    first = upload(client)
    asset = Asset.objects.get(pk=first["id"])
    url = first["variants"][0]["url"]
    anonymous = APIClient()
    info_url = f"/api/media/{asset.pk}/"
    assert anonymous.get(info_url).status_code == 404
    assert anonymous.get(url, HTTP_ACCEPT="image/webp").status_code == 404
    private = client.get(url, secure=True, HTTP_ACCEPT="image/webp")
    assert private.status_code == 200 and private["Content-Type"] == "image/webp"
    assert "no-store" in private["Cache-Control"]
    assert b"".join(private.streaming_content).startswith(b"RIFF")
    draft = save_draft(document=document_with(asset), base_revision=0, actor=editor)
    assert anonymous.get(url).status_code == 404
    WebsiteState.objects.filter(pk=1).update(published_id=draft["revision"])
    public = anonymous.get(url, HTTP_ACCEPT="image/webp")
    assert public.status_code == 200 and public["X-Content-Type-Options"] == "nosniff"
    assert b"".join(public.streaming_content).startswith(b"RIFF")
    info = anonymous.get(info_url).json()
    assert set(info) == {"id", "width", "height", "variants"}
    assert info["variants"][0]["url"] == url
    hidden = save_draft(document=document_with(asset, visible=False), base_revision=draft["revision"], actor=editor)
    still_public = anonymous.get(url)
    assert still_public.status_code == 200  # Draft changes do not affect publication.
    assert b"".join(still_public.streaming_content).startswith(b"RIFF")
    WebsiteState.objects.filter(pk=1).update(published_id=hidden["revision"])
    assert anonymous.get(url).status_code == 404
    assert anonymous.get(info_url).status_code == 404
    private = client.get(url, secure=True)
    assert private.status_code == 200
    assert b"".join(private.streaming_content).startswith(b"RIFF")


def test_reference_metadata_is_versioned_and_missing_assets_do_not_create_snapshots(client, editor):
    asset = Asset.objects.get(pk=upload(client)["id"])
    first = save_draft(document=document_with(asset), base_revision=0, actor=editor)
    WebsiteState.objects.filter(pk=1).update(published_id=first["revision"])
    changed = deepcopy(first["document"])
    changed["sections"][0]["image"]["caption"] = "Private new caption"
    save_draft(document=changed, base_revision=first["revision"], actor=editor)
    assert "Private new caption" not in str(APIClient().get("/api/site/").json())
    assert AssetReference.objects.filter(asset=asset).count() == 2
    missing = document_with(asset)
    missing["sections"][0]["image"]["asset_id"] = str(uuid4())
    response = client.put("/api/editor/site/draft/", {"base_revision": WebsiteState.objects.get().draft_id, "document": missing}, format="json", secure=True)
    assert response.status_code == 400


def test_historical_and_entry_references_prevent_deletion(client, editor):
    result = upload(client)
    asset = Asset.objects.get(pk=result["id"])
    doc = blank_document()
    doc["sections"][-1]["entries"] = [{"id": str(uuid4()), "title": "Fictional photo", "image": reference(asset)}]
    first = save_draft(document=doc, base_revision=0, actor=editor)
    save_draft(document=blank_document(), base_revision=first["revision"], actor=editor)
    assert client.delete(f"{LIBRARY}{asset.pk}/", secure=True).status_code == 409
    assert Asset.objects.filter(pk=asset.pk).exists()


@pytest.mark.django_db(transaction=True)
def test_unreferenced_delete_removes_files_after_commit(client, media_root):
    result = upload(client)
    assert client.delete(f"{LIBRARY}{result['id']}/", secure=True).status_code == 204
    assert not Asset.objects.exists() and not list(media_root.iterdir())
    assert APIClient().get(result["variants"][0]["url"]).status_code == 404


@pytest.mark.parametrize("failure", ["encode", "rename", "database"])
def test_failed_uploads_roll_back_and_do_not_leave_broken_assets(client, media_root, failure):
    target = {"encode": "wedding.media.services.Image.Image.save", "rename": "wedding.media.services.os.replace", "database": "wedding.media.models.Asset.save"}[failure]
    # Build the uploaded bytes before simulating the output failure.
    file = photo()
    exception = IntegrityError("fictional database failure") if failure == "database" else OSError("fictional storage failure")
    with patch(target, side_effect=exception):
        response = client.post(LIBRARY, {"file": file}, format="multipart", secure=True)
    assert response.status_code == 503
    assert not Asset.objects.exists() and not list(media_root.iterdir())


@pytest.mark.parametrize("changes", [{"alt_text": ""}, {"focal_x": 2}, {"focal_y": "NaN"}])
def test_bad_reference_metadata_is_rejected(client, editor, changes):
    asset = Asset.objects.get(pk=upload(client)["id"])
    document = document_with(asset)
    document["sections"][0]["image"].update(changes)
    assert client.put("/api/editor/site/draft/", {"base_revision": 0, "document": document}, format="json", secure=True).status_code == 400


@pytest.mark.django_db(transaction=True)
def test_concurrent_reference_and_delete_cannot_leave_dangling_images(client, editor):
    result = upload(client)
    asset = Asset.objects.get(pk=result["id"])
    document = document_with(asset)
    actor_id = editor.pk
    def request(action):
        close_old_connections()
        try:
            actor = get_user_model().objects.get(pk=actor_id)
            worker = APIClient(enforce_csrf_checks=True)
            worker.force_login(actor)
            session = worker.session
            session["editor_started_at"] = timezone.now().timestamp()
            session.save()
            csrf = worker.get("/api/editor/csrf/", secure=True).json()["csrf_token"]
            worker.credentials(HTTP_X_CSRFTOKEN=csrf, HTTP_ORIGIN="https://testserver")
            if action == "save":
                return worker.put("/api/editor/site/draft/", {"base_revision": 0, "document": document}, format="json", secure=True).status_code
            return worker.delete(f"{LIBRARY}{asset.pk}/", secure=True).status_code
        finally:
            close_old_connections()
    with ThreadPoolExecutor(max_workers=2) as workers:
        saved, deleted = list(workers.map(request, ["save", "delete"]))
    assert (saved, deleted) in {(200, 409), (400, 204)}
    assert Asset.objects.filter(pk=asset.pk).exists() == (saved == 200)
    assert services.asset_directory(asset.pk).exists() == (saved == 200)
