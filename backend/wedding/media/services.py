import os
import shutil
import warnings
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID

from django.conf import settings
from django.db import DatabaseError, transaction
from PIL import Image, ImageOps
from rest_framework.exceptions import ValidationError

from .models import Asset

MAX_BYTES = 16 * 1024 * 1024
MAX_PIXELS = 32_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def asset_directory(asset_id):
    return Path(settings.MEDIA_ROOT) / UUID(str(asset_id)).hex


def image_ids(document):
    ids = set()
    for section in document.get("sections", []):
        for item in [section, *section.get("entries", [])]:
            if item.get("image"):
                ids.add(UUID(str(item["image"]["asset_id"])))
    return ids


def decode_upload(upload):
    raw = upload.read(MAX_BYTES + 1)
    if not raw or len(raw) > MAX_BYTES:
        raise ValidationError({"file": ["Choose an image up to 16 MiB."]})
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw), formats=["JPEG", "PNG", "WEBP"]) as probe:
                probe.verify()
            with Image.open(BytesIO(raw), formats=["JPEG", "PNG", "WEBP"]) as source:
                if source.width * source.height > MAX_PIXELS or max(source.size) > 12000 or getattr(source, "is_animated", False):
                    raise ValueError("Unsupported dimensions or animation")
                source.load()
                oriented = ImageOps.exif_transpose(source)
                try:
                    mode = "RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB"
                    # A new canvas carries pixels only, without EXIF/ICC/XMP or filenames.
                    clean = Image.new(mode, oriented.size)
                    clean.paste(oriented.convert(mode))
                    return clean
                finally:
                    oriented.close()
    except (OSError, ValueError, SyntaxError, TypeError, Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise ValidationError({"file": ["Choose a valid, still JPEG, PNG or WebP image within 32 megapixels and 12,000 pixels per side."]}) from None


def upload_asset(upload, actor):
    clean = decode_upload(upload)
    asset = Asset(width=clean.width, height=clean.height, created_by=actor, variants={})
    final = asset_directory(asset.pk)
    try:
        Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix=".upload-", dir=settings.MEDIA_ROOT) as staging:
            for width in sorted({min(clean.width, target) for target in (640, 1280, 1920)}):
                height = max(1, round(clean.height * width / clean.width))
                with clean.resize((width, height), Image.Resampling.LANCZOS) as variant:
                    variant.save(Path(staging) / f"{width}.webp", format="WEBP", quality=85, method=4)
                asset.variants[str(width)] = {"width": width, "height": height}
            try:
                with transaction.atomic():
                    asset.save(force_insert=True)
                    os.replace(staging, final)
            except Exception:
                # Confirm rollback before removing final files. On an uncertain commit,
                # retaining a private orphan is safer than breaking a committed asset.
                try:
                    if not Asset.objects.filter(pk=asset.pk).exists():
                        shutil.rmtree(final, ignore_errors=True)
                except DatabaseError:
                    pass
                raise
        return asset
    finally:
        clean.close()


def delete_asset(asset):
    path = asset_directory(asset.pk)
    asset.delete()
    transaction.on_commit(lambda: shutil.rmtree(path, ignore_errors=True))
