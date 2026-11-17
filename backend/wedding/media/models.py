from uuid import uuid4

from django.conf import settings
from django.db import models


class Asset(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    variants = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)


class AssetReference(models.Model):
    asset = models.ForeignKey(Asset, on_delete=models.PROTECT, related_name="references")
    revision = models.ForeignKey("content.SiteRevision", on_delete=models.PROTECT, related_name="image_references")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["asset", "revision"], name="unique_revision_asset")]
