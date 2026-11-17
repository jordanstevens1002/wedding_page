from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class RevisionQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("Website revisions are append-only.")

    def delete(self):
        raise ValidationError("Website revisions are append-only.")

    def bulk_create(self, *args, **kwargs):
        raise ValidationError("Create validated revisions through the draft service.")


class SiteRevision(models.Model):
    document = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    objects = RevisionQuerySet.as_manager()

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Website revisions are append-only.")
        kwargs["force_insert"] = True
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Website revisions are append-only.")


class WebsiteState(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    draft = models.ForeignKey(SiteRevision, null=True, blank=True, on_delete=models.PROTECT, related_name="draft_for")
    published = models.ForeignKey(SiteRevision, null=True, blank=True, on_delete=models.PROTECT, related_name="published_for")

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(id=1), name="single_website")]
