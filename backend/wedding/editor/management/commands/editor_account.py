import getpass
import sys

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError
from django.utils import timezone

from wedding.editor.models import EditorAccount
from wedding.editor.security import locked_throttle


class Command(BaseCommand):
    help = "Bootstrap or recover the single editor; passwords are read privately, never as arguments."

    def add_arguments(self, parser):
        parser.add_argument("operation", choices=["bootstrap", "recover"])
        parser.add_argument("--username", help="Bootstrap username (default: editor)")
        parser.add_argument("--password-stdin", action="store_true", help="Read a password line from private stdin")

    def handle(self, *args, **options):
        recover = options["operation"] == "recover"
        if recover and options["username"]:
            raise CommandError("Recovery uses the configured editor; omit --username.")
        if options["password_stdin"]:
            password = sys.stdin.readline().rstrip("\r\n")
        else:
            if not sys.stdin.isatty():
                raise CommandError("Use an interactive terminal or explicit --password-stdin.")
            password = getpass.getpass("New editor password: ")
            if password != getpass.getpass("Confirm password: "):
                raise CommandError("Passwords do not match.")
        try:
            with locked_throttle() as bucket:
                editor = EditorAccount.objects.select_related("user").filter(pk=1).first()
                if recover and editor is None:
                    raise CommandError("No editor is configured; bootstrap first.")
                if not recover and editor is not None:
                    raise CommandError("Editor already configured; use recover.")
                user = editor.user if recover else get_user_model()(username=options["username"] or "editor")
                validate_password(password, user=user)
                user.set_password(password)
                user.is_active = True
                user.full_clean()
                user.save()
                if not recover:
                    EditorAccount.objects.create(pk=1, user=user)
                bucket.attempts = 0
                bucket.started_at = timezone.now()
        except ValidationError as error:
            raise CommandError(" ".join(error.messages)) from None
        except IntegrityError:
            raise CommandError("Editor already configured or username unavailable.") from None
        self.stdout.write("Editor credentials configured. Previous sessions are revoked on recovery.")
