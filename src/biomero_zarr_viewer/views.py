import logging
import mimetypes
from functools import wraps
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_GET, require_http_methods

try:
    from omeroweb.webclient.decorators import login_required
except ImportError:  # Allows isolated tests without a full OMERO.web installation.
    def login_required(*_args, **_kwargs):
        def decorator(function):
            return function

        return decorator

from .errors import DataNotFound, UnsupportedStore, UnsafePath, ViewerError
from .metadata import inspect_store
from .resolver import resolve_image_store, resolve_plate_store
from .settings import internal_prefix, mount_root
from .tokens import make_read_context, validate_read_context

logger = logging.getLogger(__name__)


def api_errors(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except ViewerError as exc:
            return JsonResponse(
                {
                    "supported": False,
                    "error": {"code": exc.code, "message": str(exc)},
                },
                status=exc.status,
            )
        except Exception:
            logger.exception("Unhandled BIOMERO OME-Zarr Viewer error")
            return JsonResponse(
                {
                    "supported": False,
                    "error": {
                        "code": "internal_error",
                        "message": "The OME-Zarr viewer request failed",
                    },
                },
                status=500,
            )

    return wrapped


@require_GET
@login_required(setGroupContext=True)
def viewer(request, conn=None, **kwargs):
    plate_id = request.GET.get("plate")
    if plate_id and not request.GET.get("image"):
        try:
            store = resolve_plate_store(conn, plate_id)
            query = request.GET.copy()
            query.pop("plate", None)
            query["image"] = str(store.image_id)
            return HttpResponseRedirect(f"{reverse('biomero_zarr_viewer_index')}?{query.urlencode()}")
        except ViewerError:
            # The capability check normally prevents this path. Rendering the
            # host lets the frontend show its standard missing-image message.
            pass
    return render(request, "biomero_zarr_viewer/viewer.html")


@require_GET
@login_required(setGroupContext=True)
@api_errors
def capabilities(request, image_id, conn=None, **kwargs):
    store = resolve_image_store(conn, image_id)
    return _capability_response(request, conn, store)


@require_GET
@login_required(setGroupContext=True)
@api_errors
def plate_capabilities(request, plate_id, conn=None, **kwargs):
    store = resolve_plate_store(conn, plate_id)
    return _capability_response(request, conn, store, require_plate=True)


def _capability_response(request, conn, store, *, require_plate=False):
    model = inspect_store(store.path, store.recorded_files)
    if require_plate and model.get("kind") != "plate":
        raise UnsupportedStore("The selected OMERO Plate is not backed by an OME-Zarr plate store")
    token, expires_at = make_read_context(
        request, conn, store.image_id, store.relative
    )
    sentinel = "__zarr_key__"
    data_url = reverse(
        "biomero_zarr_viewer_data",
        kwargs={"image_id": store.image_id, "zarr_key": sentinel},
    )
    data_url = data_url[: -len(sentinel)]
    return JsonResponse(
        {
            "schema_version": 1,
            "supported": True,
            "image": {"id": store.image_id, "name": store.image_name},
            "store": {
                "url": data_url,
                "context": token,
                "expires_at": expires_at.isoformat(),
            },
            **model,
        }
    )


def _safe_data_path(store_relative, zarr_key):
    store = PurePosixPath(str(store_relative).replace("\\", "/"))
    key_text = str(zarr_key).replace("\\", "/")
    key = PurePosixPath(key_text)
    if (
        not store.parts
        or store.is_absolute()
        or key.is_absolute()
        or ".." in store.parts
        or ".." in key.parts
        or "\x00" in key_text
    ):
        raise UnsafePath("The requested Zarr key is unsafe")
    root = Path(mount_root()).resolve(strict=True)
    candidate = root.joinpath(*store.parts, *key.parts).resolve(strict=False)
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise UnsafePath("The requested Zarr key escapes the configured mount") from exc
    if not candidate.is_file():
        raise DataNotFound("The requested Zarr key does not exist")
    return candidate, PurePosixPath(*store.parts, *key.parts)


@require_http_methods(["GET", "HEAD"])
@login_required(setGroupContext=True)
@api_errors
def data(request, image_id, zarr_key, conn=None, **kwargs):
    claims = validate_read_context(request, conn, image_id)
    candidate, relative = _safe_data_path(claims.get("store", ""), zarr_key)
    content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
    response = HttpResponse(content_type=content_type)
    encoded = "/".join(quote(part, safe="") for part in relative.parts)
    response["X-Accel-Redirect"] = internal_prefix() + encoded
    response["Content-Length"] = str(candidate.stat().st_size)
    response["Cache-Control"] = "private, max-age=300"
    response["X-Content-Type-Options"] = "nosniff"
    return response
