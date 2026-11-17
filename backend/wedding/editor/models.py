from django.conf import settings
from django.db import models
from django.utils import timezone


class EditorAccount(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(id=1), name="single_editor")]


class LoginThrottle(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    started_at = models.DateTimeField(default=timezone.now)
    attempts = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(id=1), name="single_editor_throttle")]
