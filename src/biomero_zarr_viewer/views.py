from . import __version__
import json
import hashlib
import logging
import mimetypes
from functools import wraps, lru_cache
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from django.http import HttpResponse, HttpResponseRedirect, JsonResponse, FileResponse
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
    InvalidShallowManifest,
    InvalidContext,
    ROILimitExceeded,
    UnsafePath,
    UnsupportedStore,
    ViewerError,
)
from .metadata import inspect_label, inspect_store, read_store_uuid
from .resolver import (
    image_store_registered,
    plate_store_registered,
    resolve_image_store,
    resolve_plate_store,
    resolve_well_store,
    well_store_registered,
)
from .roi import render_recipe_png, render_recipe_svg, render_roi_png
from .settings import internal_prefix, mount_root
from .tokens import make_read_context, validate_read_context, filesystem_context
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
@api_errors
def viewer(request, conn=None, **kwargs):
    well_id = request.GET.get("well")
    if well_id and not request.GET.get("image"):
        try:
            store = resolve_well_store(conn, well_id)
            query = request.GET.copy()
            query.pop("well", None)
            query["image"] = str(store.image_id)
            query["v"] = "2"
            query["view"] = "well"
            return HttpResponseRedirect(f"{reverse('biomero_zarr_viewer_index')}?{query.urlencode()}")
        except InvalidShallowManifest:
            raise
        except ViewerError:
            pass
    plate_id = request.GET.get("plate")
    if plate_id and not request.GET.get("image"):
        try:
            store = resolve_plate_store(conn, plate_id)
            query = request.GET.copy()
            query.pop("plate", None)
            query["image"] = str(store.image_id)
            query["v"] = "2"
            query.setdefault("view", "plate")
            return HttpResponseRedirect(f"{reverse('biomero_zarr_viewer_index')}?{query.urlencode()}")
        except InvalidShallowManifest:
            raise
        except ViewerError:
            # The capability check normally prevents this path. Rendering the
            # host lets the frontend show its standard missing-image message.
            pass
    entry = Path(__file__).with_name("static") / "biomero_zarr_viewer/app.js"
    frontend_build = hashlib.sha256(entry.read_bytes()).hexdigest()[:16] if entry.is_file() else "unbuilt"
    return render(request, "biomero_zarr_viewer/viewer.html", {"frontend_build": frontend_build})


@require_GET
@login_required(setGroupContext=True)
@api_errors
def capabilities(request, image_id, conn=None, **kwargs):
    store = resolve_image_store(conn, image_id)
    return _capability_response(request, conn, store)


@require_GET
@login_required(setGroupContext=True)
@api_errors
def metadata_details(request, image_id, conn=None, **kwargs):
    from .metadata_details import zarr_details, omero_details
    store = resolve_image_store(conn, image_id)
    model = _inspect_resolved_store(store, request.GET.get("field"))
    section = request.GET.get("section", "summary")
    if section not in ("summary", "nodes", "omero"):
        raise InvalidROI("Invalid metadata section")
    if getattr(store, "http", None) is not None:
        source = store.http
        nodes = [] if section == "omero" else [
            {"path": ".", "attributes": source.attributes(), "documents": {".zattrs": source.attributes(), ".zgroup": {"zarr_format": 2}}},
            *[{"path": level, "attributes": {}, "array": source.array_metadata(level),
               "documents": {".zarray": source.array_metadata(level)}} for level in source.levels()],
        ]
        details = {"nodes": nodes, "notices": []}
    else:
        details = zarr_details(store, _safe_data_path, section=section, field=model["initial_path"], model=model, cursor=request.GET.get("cursor"))
    response = JsonResponse({"zarr": {**details,
                             "format": model["zarr_format"], "ngff_version": model["ngff_version"],
                             "kind": model["kind"]}, "omero": omero_details(store.image) if section in ("summary", "omero") else {}})
    response["Cache-Control"] = "private, no-store"
    return response


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


@require_GET
@login_required(setGroupContext=True)
def well_eligibility(request, well_id, conn=None, **kwargs):
    return JsonResponse({"supported": well_store_registered(conn, well_id)})


def _capability_response(request, conn, store, *, require_plate=False):
    from .volume_cache import cache_limit
    model = _inspect_resolved_store(store, request.GET.get("field"))
    if require_plate and model.get("kind") != "plate":
        raise UnsupportedStore("The selected OMERO Plate is not backed by an OME-Zarr plate store")
    token, expires_at = make_read_context(
        request, conn, store.image_id, store.relative, store.routes,
        backend="omero-web-zarr" if store.http is not None else "filesystem",
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
    render_svg_url = reverse(
        "biomero_zarr_viewer_render_svg",
        kwargs={"image_id": store.image_id},
    )
    store_uuid = model.pop("store_uuid", None)
    binding_digest = hashlib.sha256(json.dumps({
        "relative": str(store.relative),
        "store_uuid": store_uuid,
        "routes": [(str(route.logical), str(route.physical)) for route in store.routes],
    }, sort_keys=True).encode("utf-8")).hexdigest()
    return JsonResponse(
        {
            "schema_version": 1,
            "viewer_version": __version__,
            "supported": True,
            "features": ["zarr-review-export-v1", "zarr-movie-v1"],
            "image": {"id": store.image_id, "name": store.image_name},
            "store": {
                "url": data_url,
                "context": token,
                "expires_at": expires_at.isoformat(),
                "uuid": store_uuid,
                "name": store.image_name if store.http is not None else (store.identity_path.name if store.identity_path else store.relative.name),
                "transport": "http" if store.http is not None else "filesystem",
                "roi_url": roi_url,
                "render_url": render_url,
                "volume_url": reverse("biomero_zarr_viewer_volume", kwargs={"image_id": store.image_id}) if store.http is None and cache_limit() else None,
                "neuroglancer_url": reverse("biomero_zarr_viewer_neuroglancer", kwargs={"image_id": store.image_id}) if store.http is None and cache_limit() else None,
                "preview_url": reverse("biomero_zarr_viewer_previews", kwargs={"image_id": store.image_id}) if store.http is None and cache_limit() else None,
                "movie_url": reverse("biomero_zarr_viewer_index") + f"?image={store.image_id}",
                "binding_digest": binding_digest,
                "render_svg_url": render_svg_url,
            },
            **model,
        }
    )


def _inspect_resolved_store(store, selected_field=None):
    if selected_field is not None and not isinstance(selected_field, str):
        raise InvalidROI("The selected field must be a path")
    source = getattr(store, "http", None)
    model = source.model() if source is not None else inspect_store(store.path, store.recorded_files)
    if selected_field is not None and selected_field != model["initial_path"]:
        from .metadata import _image_model
        valid = {f["path"] for w in model.get("plate", {}).get("wells", []) for f in w["fields"]}
        if selected_field not in valid:
            raise DataNotFound("The selected field is not available")
        model.update(_image_model(store.path, selected_field, model["ngff_version"]))
        model["initial_path"] = selected_field
    if store.identity_path is not None:
        model["store_uuid"] = read_store_uuid(store.identity_path)
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


def _recipe_field(recipe):
    panels = recipe.get("panels") if isinstance(recipe, dict) else None
    return panels[0].get("field") if isinstance(panels, list) and panels and isinstance(panels[0], dict) else None


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
    model = _inspect_resolved_store(store, request.GET.get("field"))
    rendered = render_roi_png(
        store.path, model, request.GET, label_roots=_label_roots(store),
        array_root=store.http.open_group() if store.http is not None else None,
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
    model = _inspect_resolved_store(store, _recipe_field(recipe))
    rendered = render_recipe_png(
        store.path, model, recipe, label_roots=_label_roots(store),
        array_root=store.http.open_group() if store.http is not None else None,
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
def render_svg(request, image_id, conn=None, **kwargs):
    if len(request.body) > 1024 * 1024:
        raise ROILimitExceeded("The render recipe exceeds 1 MiB")
    try:
        recipe = json.loads(request.body or b"{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidROI("The render recipe is not valid JSON") from exc
    store = resolve_image_store(conn, image_id)
    model = _inspect_resolved_store(store, _recipe_field(recipe))
    rendered = render_recipe_svg(store.path, model, recipe, label_roots=_label_roots(store),
                                 array_root=store.http.open_group() if store.http is not None else None)
    response = HttpResponse(rendered.content, content_type="image/svg+xml")
    response["Content-Disposition"] = f'attachment; filename="{rendered.filename}"'
    response["Content-Length"] = str(len(rendered.content))
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"
    return response


@lru_cache(maxsize=4)
def _route_index(routes):
    """Parse a signed manifest once, rather than thousands of times per plate."""
    index = {}
    for logical_text, physical_text in routes:
        logical = PurePosixPath(logical_text.replace("\\", "/"))
        physical = PurePosixPath(physical_text.replace("\\", "/"))
        if logical.is_absolute() or physical.is_absolute() or ".." in logical.parts or ".." in physical.parts:
            raise UnsafePath("The signed Zarr route is unsafe")
        index[logical.parts] = physical
    return index


def _safe_data_path(store_relative, zarr_key, routes=(), *, allow_directory=False):
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
    normalized = []
    for route in routes if isinstance(routes, list) else ():
        if not isinstance(route, list) or len(route) != 2:
            raise UnsafePath("The signed Zarr route is invalid")
        normalized.append((str(route[0]), str(route[1])))
    index = _route_index(tuple(normalized))
    for length in range(len(key.parts), 0, -1):
        if key.parts[:length] in index:
            selected_store = index[key.parts[:length]]
            suffix = PurePosixPath(*key.parts[length:])
            break
    root = Path(mount_root()).resolve(strict=True)
    candidate = root.joinpath(*selected_store.parts, *suffix.parts).resolve(strict=False)
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise UnsafePath("The requested Zarr key escapes the configured mount") from exc
    if not (candidate.is_dir() if allow_directory else candidate.is_file()):
        raise DataNotFound("The requested Zarr key does not exist")
    return candidate, PurePosixPath(*selected_store.parts, *suffix.parts)


@require_GET
@login_required(setGroupContext=True)
@api_errors
def cached_volume(request, image_id, conn=None, **kwargs):
    from . import volume_cache
    if not volume_cache.cache_limit():
        raise UnsupportedStore("Volume cache is disabled")
    claims = filesystem_context(validate_read_context(request, conn, image_id))
    scope = volume_cache.scope_key(claims, image_id)
    job = request.GET.get("job")
    if job:
        result = volume_cache.entry(job, scope)
    else:
        field = request.GET.get("field", ".")
        try:
            level, channel, timepoint = [int(request.GET.get(key, "0")) for key in ("level", "c", "t")]
        except ValueError as exc:
            raise InvalidROI("Invalid volume selection") from exc
        if field.startswith("/") or ".." in PurePosixPath(field.replace("\\", "/")).parts:
            raise UnsafePath("Invalid volume field")
        field_prefix = "" if field == "." else field.strip("/") + "/"
        group_path = None
        for filename in ("zarr.json", ".zattrs"):
            try:
                group_path, _ = _safe_data_path(claims["store"], field_prefix + filename, claims.get("routes", []))
                break
            except DataNotFound:
                continue
        if group_path is None:
            raise DataNotFound("Volume metadata not found")
        if group_path.stat().st_size > 4*1024*1024:
            raise ROILimitExceeded("Volume metadata is too large")
        metadata = json.loads(group_path.read_text())
        if group_path.name == "zarr.json":
            metadata = metadata.get("attributes", {}).get("ome", {})
        multiscale = metadata.get("multiscales", [{}])[0]
        datasets = multiscale.get("datasets", [])
        if level < 0 or level >= len(datasets):
            raise InvalidROI("Invalid pyramid level")
        axes = [axis.get("name") if isinstance(axis, dict) else axis for axis in multiscale.get("axes", [])]
        dataset_path = str(datasets[level]["path"])
        if PurePosixPath(dataset_path).is_absolute():
            raise UnsafePath("Invalid volume dataset")
        array_key = field_prefix + dataset_path
        array_metadata, _ = _safe_data_path(claims["store"], array_key + ("/zarr.json" if group_path.name == "zarr.json" else "/.zarray"), claims.get("routes", []))
        description = volume_cache.describe_volume(array_metadata.parent, axes, channel, timepoint)
        version = hashlib.sha256(group_path.read_bytes()).hexdigest() + volume_cache.fingerprint(
            array_metadata.parent, Path(mount_root()), axes=axes, channel=channel, timepoint=timepoint)
        result = volume_cache.request_volume(array_metadata.parent, axes, channel, timepoint, scope, version, description=description, retry=request.GET.get("retryFailed") == "1")
    if request.GET.get("download") == "1" and result["status"] == "ready":
        try:
            handle = (volume_cache.cache_root() / (result["key"] + ".bin")).open("rb")
        except FileNotFoundError as exc:
            raise DataNotFound("Volume was evicted; request it again") from exc
        response = FileResponse(handle, content_type="application/octet-stream")
        response["Content-Length"] = str(result["size"])
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response
    response = JsonResponse({"key": result["key"], "status": result["status"], "progress": result["progress"], **result["metadata"], "error": result["error"]})
    response["Cache-Control"] = "no-store"
    return response


@require_GET
@login_required(setGroupContext=True)
@api_errors
def cached_previews(request, image_id, conn=None, **kwargs):
    from . import volume_cache, preview_cache
    if not volume_cache.cache_limit():
        raise UnsupportedStore("Preview cache is disabled")
    claims = filesystem_context(validate_read_context(request, conn, image_id))
    scope = volume_cache.scope_key(claims, image_id)
    try:
        fields=json.loads(request.GET.get("fields","[]"))
        channels=json.loads(request.GET.get("channels","[]"))
        size=int(request.GET.get("size","64"))
        z=int(request.GET.get("z","0")); t=int(request.GET.get("t","0"))
    except (ValueError,TypeError) as exc:
        raise InvalidROI("Invalid preview request") from exc
    if not isinstance(fields,list) or not 1<=len(fields)<=16 or not isinstance(channels,list) or len(channels)>8 or not 32<=size<=2048 or min(z,t)<0:
        raise InvalidROI("Invalid preview batch")
    if len(fields)*min(4_194_304,(size*1.6)**2)>16_777_216:
        raise ROILimitExceeded("Preview batch is too large")
    results=[]
    for field in fields:
        try:
            results.append(preview_cache.render_preview(claims,scope,field,size,channels,z,t,_safe_data_path))
        except ViewerError as exc:
            results.append({"field":field,"error":str(exc)})
        except Exception:
            logger.exception("Unable to render plate preview")
            results.append({"field":field,"error":"Preview could not be rendered"})
    response=JsonResponse({"previews":results})
    response["Cache-Control"]="no-store"
    return response


@require_http_methods(["GET", "HEAD"])
@login_required(setGroupContext=True)
@api_errors
def data(request, image_id, zarr_key, conn=None, **kwargs):
    claims = validate_read_context(request, conn, image_id)
    backend = claims.get("backend", "filesystem")
    if backend == "omero-web-zarr":
        # Recheck image access and source selection on every virtual read. A
        # signed token cannot switch providers or survive revoked image access.
        store = resolve_image_store(conn, image_id)
        if store.http is None or str(store.relative) != claims.get("store"):
            raise InvalidContext("The virtual Zarr source has changed")
        content = store.http.read(zarr_key)
        response = HttpResponse(b"" if request.method == "HEAD" else content,
                                content_type="application/json" if zarr_key.rsplit("/", 1)[-1] in (".zattrs", ".zarray", ".zgroup", "zarr.json") else "application/octet-stream")
        response["Content-Length"] = str(len(content))
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
    if backend != "filesystem":
        raise InvalidContext("Unknown Zarr backend")
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
