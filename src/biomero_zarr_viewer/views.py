import json
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

from .errors import (
    DataNotFound,
    InvalidROI,
    ROILimitExceeded,
    UnsafePath,
    UnsupportedStore,
    ViewerError,
)
from .metadata import inspect_label, inspect_store
from .resolver import (
    image_store_registered,
    plate_store_registered,
    resolve_image_store,
    resolve_plate_store,
)
from .roi import render_recipe_png, render_roi_png
from .settings import internal_prefix, mount_root
from .tokens import make_read_context, validate_read_context
from .analysis_skill_provider import catalog_payload, package_payload, SKILL_NAME

logger = logging.getLogger(__name__)


@require_GET
@login_required(setGroupContext=True)
def analysis_skills(request, conn=None, **kwargs):
    return JsonResponse(catalog_payload())


@require_GET
@login_required(setGroupContext=True)
def analysis_skill(request, skill_name, conn=None, **kwargs):
    if skill_name != SKILL_NAME:
        return JsonResponse(
            {"error": {"code": "skill_not_found", "message": "Skill not found"}},
            status=404,
        )
    return JsonResponse(package_payload())


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


@require_GET
@login_required(setGroupContext=True)
def image_eligibility(request, image_id, conn=None, **kwargs):
    return JsonResponse({"supported": image_store_registered(conn, image_id)})


@require_GET
@login_required(setGroupContext=True)
def plate_eligibility(request, plate_id, conn=None, **kwargs):
    return JsonResponse({"supported": plate_store_registered(conn, plate_id)})


def _capability_response(request, conn, store, *, require_plate=False):
    model = _inspect_resolved_store(store)
    if require_plate and model.get("kind") != "plate":
        raise UnsupportedStore("The selected OMERO Plate is not backed by an OME-Zarr plate store")
    token, expires_at = make_read_context(
        request, conn, store.image_id, store.relative, store.routes
    )
    sentinel = "__zarr_key__"
    data_url = reverse(
        "biomero_zarr_viewer_data",
        kwargs={"image_id": store.image_id, "zarr_key": sentinel},
    )
    data_url = data_url[: -len(sentinel)]
    roi_url = reverse(
        "biomero_zarr_viewer_roi_png",
        kwargs={"image_id": store.image_id},
    )
    render_url = reverse(
        "biomero_zarr_viewer_render_png",
        kwargs={"image_id": store.image_id},
    )
    store_uuid = model.pop("store_uuid", None)
    return JsonResponse(
        {
            "schema_version": 1,
            "supported": True,
            "image": {"id": store.image_id, "name": store.image_name},
            "store": {
                "url": data_url,
                "context": token,
                "expires_at": expires_at.isoformat(),
                "uuid": store_uuid,
                "name": store.relative.name,
                "roi_url": roi_url,
                "render_url": render_url,
            },
            **model,
        }
    )


def _inspect_resolved_store(store):
    model = inspect_store(store.path, store.recorded_files)
    if not store.routes:
        return model
    field = PurePosixPath(model["initial_path"])
    labels = []
    for route in store.routes:
        logical = route.logical
        if logical.parts[: len(field.parts)] != field.parts:
            continue
        if len(logical.parts) < len(field.parts) + 2 or logical.parts[len(field.parts)] != "labels":
            continue
        physical = Path(mount_root()).joinpath(*route.physical.parts)
        labels.append(
            inspect_label(
                physical,
                str(logical),
                model["ngff_version"],
                label_id=len(labels),
            )
        )
    model["labels"] = labels
    model["composite_store"] = True
    return model


def _label_roots(store):
    root = Path(mount_root())
    return {
        str(route.logical): root.joinpath(*route.physical.parts)
        for route in store.routes
    }


@require_GET
@login_required(setGroupContext=True)
@api_errors
def roi_png(request, image_id, conn=None, **kwargs):
    store = resolve_image_store(conn, image_id)
    model = _inspect_resolved_store(store)
    rendered = render_roi_png(
        store.path, model, request.GET, label_roots=_label_roots(store)
    )
    response = HttpResponse(rendered.content, content_type="image/png")
    response["Content-Disposition"] = f'attachment; filename="{rendered.filename}"'
    response["Content-Length"] = str(len(rendered.content))
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@require_http_methods(["POST"])
@login_required(setGroupContext=True)
@api_errors
def render_png(request, image_id, conn=None, **kwargs):
    if len(request.body) > 1024 * 1024:
        raise ROILimitExceeded("The render recipe exceeds 1 MiB")
    try:
        recipe = json.loads(request.body or b"{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidROI("The render recipe is not valid JSON") from exc
    store = resolve_image_store(conn, image_id)
    model = _inspect_resolved_store(store)
    rendered = render_recipe_png(
        store.path, model, recipe, label_roots=_label_roots(store)
    )
    response = HttpResponse(rendered.content, content_type="image/png")
    response["Content-Disposition"] = f'attachment; filename="{rendered.filename}"'
    response["Content-Length"] = str(len(rendered.content))
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


def _safe_data_path(store_relative, zarr_key, routes=()):
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
    selected_store = store
    suffix = key
    matches = []
    for route in routes if isinstance(routes, list) else ():
        if not isinstance(route, list) or len(route) != 2:
            raise UnsafePath("The signed Zarr route is invalid")
        logical = PurePosixPath(str(route[0]).replace("\\", "/"))
        physical = PurePosixPath(str(route[1]).replace("\\", "/"))
        if logical.is_absolute() or physical.is_absolute() or ".." in logical.parts or ".." in physical.parts:
            raise UnsafePath("The signed Zarr route is unsafe")
        if key == logical or key.parts[: len(logical.parts)] == logical.parts:
            matches.append((len(logical.parts), logical, physical))
    if matches:
        _, logical, selected_store = max(matches, key=lambda item: item[0])
        suffix = PurePosixPath(*key.parts[len(logical.parts):])
    root = Path(mount_root()).resolve(strict=True)
    candidate = root.joinpath(*selected_store.parts, *suffix.parts).resolve(strict=False)
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise UnsafePath("The requested Zarr key escapes the configured mount") from exc
    if not candidate.is_file():
        raise DataNotFound("The requested Zarr key does not exist")
    return candidate, PurePosixPath(*selected_store.parts, *suffix.parts)


@require_http_methods(["GET", "HEAD"])
@login_required(setGroupContext=True)
@api_errors
def data(request, image_id, zarr_key, conn=None, **kwargs):
    claims = validate_read_context(request, conn, image_id)
    candidate, relative = _safe_data_path(
        claims.get("store", ""), zarr_key, claims.get("routes", [])
    )
    content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
    response = HttpResponse(content_type=content_type)
    encoded = "/".join(quote(part, safe="") for part in relative.parts)
    response["X-Accel-Redirect"] = internal_prefix() + encoded
    response["Content-Length"] = str(candidate.stat().st_size)
    response["Cache-Control"] = "private, max-age=300"
    response["X-Content-Type-Options"] = "nosniff"
    return response
