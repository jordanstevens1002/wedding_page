from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ConflictSerializer, DraftSerializer, DraftWriteSerializer, PublicSiteSerializer
from .services import DraftConflict, read_draft, read_public_site, save_draft


@method_decorator(never_cache, name="dispatch")
class PublicSiteView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicSiteSerializer, auth=[])
    def get(self, request):
        return Response(PublicSiteSerializer(read_public_site()).data)


@method_decorator(never_cache, name="dispatch")
class DraftView(APIView):
    @extend_schema(responses=DraftSerializer)
    def get(self, request):
        return Response(DraftSerializer(read_draft()).data)

    @extend_schema(request=DraftWriteSerializer, responses={200: DraftSerializer, 409: ConflictSerializer})
    def put(self, request):
        data = DraftWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        # The service also validates operator writes; pass it JSON-compatible values.
        document = data.fields["document"].to_representation(data.validated_data["document"])
        try:
            result = save_draft(document=document, base_revision=data.validated_data["base_revision"], actor=request.user)
        except DraftConflict as error:
            return Response({"detail": "This draft changed. Reload before saving again.", "revision": error.revision}, status=409)
        return Response(DraftSerializer(result).data)
