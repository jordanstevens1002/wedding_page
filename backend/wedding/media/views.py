from django.db import DatabaseError, transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.exceptions import APIException, AuthenticationFailed, NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from wedding.content.services import read_public_site
from wedding.editor.security import EditorSessionAuthentication, IsEditor
from .models import Asset
from .serializers import AssetSerializer, PublicAssetSerializer, UploadSerializer
from .services import asset_directory, delete_asset, image_ids, upload_asset


class StorageUnavailable(APIException):
    status_code = 503
    default_detail = "Image storage is temporarily unavailable. Please try again."


class LibraryPagination(PageNumberPagination):
    page_size = 24
    page_size_query_param = "page_size"
    max_page_size = 100


@method_decorator(never_cache, name="dispatch")
class LibraryView(generics.ListAPIView):
    serializer_class = AssetSerializer
    pagination_class = LibraryPagination
    queryset = Asset.objects.order_by("-created_at", "-id")
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(request=UploadSerializer, responses={201: AssetSerializer})
    def post(self, request):
        data = UploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            asset = upload_asset(data.validated_data["file"], request.user)
        except (OSError, DatabaseError):
            raise StorageUnavailable() from None
        return Response(AssetSerializer(asset).data, status=201)


@method_decorator(never_cache, name="dispatch")
class AssetView(generics.RetrieveAPIView):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer

    @extend_schema(responses={204: None, 409: None})
    def delete(self, request, pk):
        with transaction.atomic():
            asset = get_object_or_404(Asset.objects.select_for_update(), pk=pk)
            if asset.references.exists():
                return Response({"detail": "This image is referenced by saved website content."}, status=409)
            delete_asset(asset)
        return Response(status=204)


class OptionalEditorAuthentication(EditorSessionAuthentication):
    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except AuthenticationFailed:
            return None


class ImageRenderer(BaseRenderer):
    media_type = "image/webp"
    format = "webp"
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # Successful responses stream files; failed image requests have an empty body.
        return b""


def accessible_asset(request, pk, view):
    public = read_public_site()["document"]
    if (not public or pk not in image_ids(public)) and not IsEditor().has_permission(request, view):
        raise NotFound()
    asset = Asset.objects.filter(pk=pk).first()
    if asset is None:
        raise NotFound()
    return asset


@method_decorator(never_cache, name="dispatch")
class AssetInfoView(APIView):
    authentication_classes = [OptionalEditorAuthentication]
    permission_classes = [AllowAny]

    @extend_schema(operation_id="media_metadata_retrieve", responses=PublicAssetSerializer, auth=[])
    def get(self, request, pk):
        return Response(PublicAssetSerializer(accessible_asset(request, pk, self)).data)


@method_decorator(never_cache, name="dispatch")
class ImageView(APIView):
    authentication_classes = [OptionalEditorAuthentication]
    permission_classes = [AllowAny]
    renderer_classes = [ImageRenderer]

    @extend_schema(operation_id="media_image_retrieve", responses={(200, "image/webp"): OpenApiTypes.BINARY}, auth=[])
    def get(self, request, pk, width):
        asset = accessible_asset(request, pk, self)
        if str(width) not in asset.variants:
            raise NotFound()
        try:
            stream = (asset_directory(pk) / f"{width}.webp").open("rb")
        except OSError:
            raise NotFound() from None
        return FileResponse(stream, content_type="image/webp")
