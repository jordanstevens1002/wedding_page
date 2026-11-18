import json
import math
from datetime import datetime, timezone as datetime_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.serializers.json import DjangoJSONEncoder
from django.core.validators import URLValidator
from django.utils.dateparse import parse_datetime
from django.utils.timezone import is_naive
from rest_framework import serializers

SECTION_NAMES = {
    "welcome": "Welcome", "story": "Our story", "schedule": "Schedule", "venue": "Venue",
    "travel": "Travel", "accommodation": "Accommodation", "faq": "Frequently asked questions",
    "registry": "Registry", "gallery": "Gallery",
}


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict) and set(data) - set(self.fields):
            raise serializers.ValidationError({"non_field_errors": ["Unsupported fields."]})
        return super().to_internal_value(data)


class TimestampField(serializers.DateTimeField):
    def to_internal_value(self, value):
        try:
            parsed = parse_datetime(value) if isinstance(value, str) else value
        except ValueError:
            parsed = None
        if not isinstance(parsed, datetime) or is_naive(parsed):
            raise serializers.ValidationError("Use an ISO timestamp with an explicit timezone offset.")
        return super().to_internal_value(value)


class ImageReferenceSerializer(StrictSerializer):
    asset_id = serializers.UUIDField()
    alt_text = serializers.CharField(max_length=500, allow_blank=True, default="")
    decorative = serializers.BooleanField(default=False)
    caption = serializers.CharField(max_length=1000, allow_blank=True, default="")
    focal_x = serializers.FloatField(min_value=0, max_value=1, default=0.5)
    focal_y = serializers.FloatField(min_value=0, max_value=1, default=0.5)

    def validate(self, data):
        if not data["decorative"] and not data["alt_text"]:
            raise serializers.ValidationError("Add alt text or mark this image as decorative.")
        if not all(math.isfinite(data[key]) for key in ["focal_x", "focal_y"]):
            raise serializers.ValidationError("Focal points must be finite numbers between zero and one.")
        return data


class ContentEntrySerializer(StrictSerializer):
    id = serializers.UUIDField()
    title = serializers.CharField(max_length=140)
    body = serializers.CharField(max_length=4000, allow_blank=True, default="")
    url = serializers.CharField(max_length=2048, allow_blank=True, default="",
                                validators=[URLValidator(schemes=["http", "https"])])
    starts_at = TimestampField(allow_null=True, default=None, default_timezone=datetime_timezone.utc)
    image = ImageReferenceSerializer(allow_null=True, default=None)


class SectionSerializer(StrictSerializer):
    id = serializers.ChoiceField(choices=list(SECTION_NAMES))
    heading = serializers.CharField(max_length=140)
    body = serializers.CharField(max_length=8000, allow_blank=True)
    visible = serializers.BooleanField()
    entries = ContentEntrySerializer(many=True, max_length=50)
    image = ImageReferenceSerializer(allow_null=True, default=None)

    def validate_entries(self, entries):
        ids = [entry["id"] for entry in entries]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Entry identifiers must be unique within a section.")
        return entries


class SiteDocumentSerializer(StrictSerializer):
    schema_version = serializers.ChoiceField(choices=[1])
    title = serializers.CharField(max_length=140)
    couple_names = serializers.CharField(max_length=200, allow_blank=True)
    wedding_date = serializers.DateField(allow_null=True)
    timezone = serializers.CharField(max_length=100)
    sections = SectionSerializer(many=True, min_length=len(SECTION_NAMES), max_length=len(SECTION_NAMES))

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Choose a valid IANA timezone.") from None
        return value

    def validate_sections(self, sections):
        if {section["id"] for section in sections} != set(SECTION_NAMES):
            raise serializers.ValidationError("Include every section identifier exactly once.")
        return sections

    def validate(self, data):
        if len(json.dumps(data, cls=DjangoJSONEncoder, ensure_ascii=False).encode("utf-8")) > 256 * 1024:
            raise serializers.ValidationError("Website text content must fit within 256 KiB.")
        return data


class PublicDocumentSerializer(SiteDocumentSerializer):
    sections = SectionSerializer(many=True, max_length=len(SECTION_NAMES))


class DraftWriteSerializer(StrictSerializer):
    base_revision = serializers.IntegerField(min_value=0)
    document = SiteDocumentSerializer()


class DraftSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    document = SiteDocumentSerializer()


class PublicSiteSerializer(serializers.Serializer):
    configured = serializers.BooleanField()
    document = PublicDocumentSerializer(allow_null=True)


class ConflictSerializer(serializers.Serializer):
    detail = serializers.CharField()
    revision = serializers.IntegerField()
