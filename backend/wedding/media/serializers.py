from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Asset


class UploadSerializer(serializers.Serializer):
    file = serializers.FileField()


class VariantSerializer(serializers.Serializer):
    width = serializers.IntegerField()
    height = serializers.IntegerField()
    url = serializers.CharField()


class AssetSerializer(serializers.ModelSerializer):
    variants = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = ["id", "width", "height", "created_at", "variants"]
        read_only_fields = fields

    @extend_schema_field(VariantSerializer(many=True))
    def get_variants(self, asset):
        return [{**dimensions, "url": f"/api/media/{asset.pk}/{width}/"}
                for width, dimensions in asset.variants.items()]


class PublicAssetSerializer(AssetSerializer):
    class Meta(AssetSerializer.Meta):
        fields = ["id", "width", "height", "variants"]
        read_only_fields = fields
