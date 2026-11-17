from uuid import uuid4

from django.core.management.base import BaseCommand, CommandError

from wedding.editor.models import EditorAccount
from wedding.content.services import DraftConflict, blank_document, save_draft


class Command(BaseCommand):
    help = "Opt in to a fictional private example; never replace an existing draft or publish it."

    def handle(self, *args, **options):
        editor = EditorAccount.objects.select_related("user").filter(pk=1).first()
        if editor is None:
            raise CommandError("Bootstrap the editor before creating an example draft.")
        document = blank_document()
        document.update(title="Fictional demonstration wedding", couple_names="Fictional Couple")
        for section in document["sections"]:
            section["body"] = f"Fictional {section['id']} text for demonstration only."
            section["visible"] = section["id"] in {"welcome", "story", "schedule", "venue", "faq"}
            if section["id"] not in {"welcome", "story", "gallery"}:
                section["entries"] = [{"id": str(uuid4()), "title": "Fictional example",
                                       "body": "Replace this demonstration text with your own information.",
                                       "url": "https://example.invalid/", "starts_at": None}]
        try:
            result = save_draft(document=document, base_revision=0, actor=editor.user)
        except DraftConflict:
            raise CommandError("An existing draft will not be replaced.") from None
        self.stdout.write(f"Fictional private draft created at revision {result['revision']}. Nothing was published.")
