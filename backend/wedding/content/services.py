from copy import deepcopy

from django.conf import settings
from django.db import transaction

from .models import SiteRevision, WebsiteState
from .serializers import SECTION_NAMES, SiteDocumentSerializer


class DraftConflict(Exception):
    def __init__(self, revision):
        self.revision = revision


def blank_document():
    return {
        "schema_version": 1, "title": "Wedding details", "couple_names": "",
        "wedding_date": None, "timezone": settings.TIME_ZONE,
        "sections": [{"id": key, "heading": heading, "body": "", "visible": False, "entries": []}
                     for key, heading in SECTION_NAMES.items()],
    }


def read_draft():
    state = WebsiteState.objects.select_related("draft").filter(pk=1).first()
    if state is None or state.draft_id is None:
        return {"revision": 0, "document": blank_document()}
    return {"revision": state.draft_id, "document": state.draft.document}


def read_public_site():
    state = WebsiteState.objects.select_related("published").filter(pk=1).first()
    if state is None or state.published_id is None:
        return {"configured": False, "document": None}
    document = deepcopy(state.published.document)
    document["sections"] = [section for section in document["sections"] if section["visible"]]
    return {"configured": True, "document": document}


def save_draft(*, document, base_revision, actor):
    # All writers, including operator commands, validate before taking the state lock.
    serializer = SiteDocumentSerializer(data=document)
    serializer.is_valid(raise_exception=True)
    normalised = dict(serializer.data)
    with transaction.atomic():
        WebsiteState.objects.get_or_create(pk=1)
        state = WebsiteState.objects.select_for_update().get(pk=1)
        current = state.draft_id or 0
        if base_revision != current:
            raise DraftConflict(current)
        revision = SiteRevision.objects.create(document=normalised, created_by=actor)
        state.draft = revision
        state.save(update_fields=["draft"])
    return {"revision": revision.pk, "document": normalised}
