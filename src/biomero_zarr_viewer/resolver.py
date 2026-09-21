"""Map a readable OMERO object to a physical or BIOMERO composite store."""

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from .errors import AmbiguousStore, ObjectNotFound, PlateNotFound, StoreNotFound, UnsafePath
from .settings import mount_root, source_root

BIOMERO_IMPORT_NAMESPACE = "biomero.import"
CANONICAL_PLATE_SOURCE_NAMESPACE = "biomero.zarr.plate-source"
SHALLOW_MANIFEST = ".biomero-shallow.json"
MAX_PARENT_DEPTH = 4
GROUP_STORAGE_ROOT = re.compile(r"^group-(\d+)-data$")


@dataclass(frozen=True)
class StoreRoute:
    """Map one logical Zarr subtree to a physical subtree below mount_root."""

    logical: PurePosixPath
    physical: PurePosixPath


@dataclass(frozen=True)
class ResolvedStore:
    image: object
    image_id: int
    image_name: str
    path: Path
    relative: PurePosixPath
    recorded_root: PurePosixPath
    recorded_files: tuple[str, ...]
    routes: tuple[StoreRoute, ...] = ()
    shallow: bool = False


def _string_value(obj, method):
    value = getattr(obj, method, None)
    if callable(value):
        value = value()
    if hasattr(value, "getValue"):
        value = value.getValue()
    return "" if value is None else str(value)


def _fileset_files(fileset):
    for method in ("listFiles", "getFiles"):
        value = getattr(fileset, method, None)
        if callable(value):
            return list(value())
    model = getattr(fileset, "_obj", None)
    if model is not None:
        for method in ("copyUsedFiles", "getUsedFiles"):
            value = getattr(model, method, None)
            if callable(value):
                return list(value())
    return []


def _recorded_paths(image):
    fileset_getter = getattr(image, "getFileset", None)
    fileset = fileset_getter() if callable(fileset_getter) else None
    if fileset is None:
        return []
    paths = []
    for original in _fileset_files(fileset):
        directory = _string_value(original, "getPath")
        name = _string_value(original, "getName")
        combined = "/".join(part.strip("/\\") for part in (directory, name) if part)
        if combined:
            paths.append(combined.replace("\\", "/"))
    return paths


def _annotation_values(annotation, expected_namespace=BIOMERO_IMPORT_NAMESPACE):
    namespace = _string_value(annotation, "getNs")
    if namespace != expected_namespace:
        return {}
    getter = getattr(annotation, "getValue", None)
    values = getter() if callable(getter) else None
    if isinstance(values, dict):
        values = values.items()
    if not isinstance(values, (list, tuple)):
        return {}
    result = {}
    for item in values:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            continue
        key, value = item
        if hasattr(key, "getValue"):
            key = key.getValue()
        if hasattr(value, "getValue"):
            value = value.getValue()
        result[str(key)] = str(value)
    return result


def _ancestry_annotations(image, namespace):
    """Yield validated map values from readable Image/container ancestry."""
    queue = [(image, 0)]
    seen = set()
    while queue:
        obj, depth = queue.pop(0)
        object_id = _string_value(obj, "getId")
        key = (type(obj).__name__, object_id or id(obj))
        if key in seen:
            continue
        seen.add(key)
        annotations = getattr(obj, "listAnnotations", None)
        if callable(annotations):
            try:
                values = list(annotations(ns=namespace))
            except TypeError:
                try:
                    values = list(annotations())
                except NotImplementedError:
                    values = ()
            except NotImplementedError:
                values = ()
            for annotation in values:
                parsed = _annotation_values(annotation, namespace)
                if parsed:
                    yield obj, parsed
        if depth < MAX_PARENT_DEPTH:
            parents = getattr(obj, "listParents", None)
            if callable(parents):
                try:
                    queue.extend((parent, depth + 1) for parent in list(parents()))
                except NotImplementedError:
                    pass


def _biomero_annotation_paths(image):
    """Read importer provenance from the readable Image/container ancestry."""
    paths = []
    for _obj, provenance in _ancestry_annotations(image, BIOMERO_IMPORT_NAMESPACE):
        filepath = provenance.get("Filepath", "").replace("\\", "/")
        if (
            filepath
            and provenance.get("UUID")
            and provenance.get("DestinationType")
            and provenance.get("Files")
        ):
            paths.append(filepath)
    return paths


def zarr_ancestor(recorded_path):
    path = PurePosixPath("/" + str(recorded_path).replace("\\", "/").lstrip("/"))
    parts = path.parts
    indexes = [index for index, part in enumerate(parts) if part.lower().endswith(".zarr")]
    if not indexes:
        return None
    return PurePosixPath(*parts[: indexes[-1] + 1])


def _map_recorded_root(recorded_root):
    source = PurePosixPath("/" + source_root().replace("\\", "/").strip("/"))
    try:
        relative = recorded_root.relative_to(source)
    except ValueError as exc:
        raise UnsafePath("The in-place source is outside the configured source root") from exc

    mount = Path(mount_root()).resolve(strict=True)
    candidate = mount.joinpath(*relative.parts).resolve(strict=True)
    try:
        candidate.relative_to(mount)
    except ValueError as exc:
        raise UnsafePath("The resolved store escapes the configured data mount") from exc
    if not candidate.is_dir():
        raise StoreNotFound("The resolved OME-Zarr store is not a directory")
    return candidate, PurePosixPath(*relative.parts)


def _safe_relative(value, *, allow_dot=False):
    raw = str(value or "").replace("\\", "/")
    supplied = PurePosixPath(raw or ".")
    if supplied.is_absolute() or ".." in supplied.parts or "\x00" in raw:
        raise UnsafePath("BIOMERO store metadata contains an unsafe path")
    text = raw.strip("/")
    path = PurePosixPath(text or ".")
    if path == PurePosixPath(".") and not allow_dot:
        raise UnsafePath("BIOMERO store metadata contains an empty path")
    return path


def _contained_directory(relative):
    root = Path(mount_root()).resolve(strict=True)
    candidate = root.joinpath(*relative.parts).resolve(strict=True)
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise UnsafePath("The resolved store escapes the configured data mount") from exc
    if not candidate.is_dir():
        raise StoreNotFound("The resolved OME-Zarr store is not a directory")
    return candidate


def _group_mappings():
    paths = [
        os.environ.get("OMERO_BIOMERO_GROUP_MAPPINGS_FILE"),
        os.environ.get("OMERO_BIOMERO_CONFIG_FILE"),
    ]
    for index, filename in enumerate(paths):
        if not filename:
            continue
        try:
            payload = json.loads(Path(filename).read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            continue
        if index == 1 and isinstance(payload, dict):
            payload = payload.get("group_mappings", {})
        if isinstance(payload, dict):
            return payload
    return {}


def _managed_relative(storage_root, relative_path):
    relative = _safe_relative(relative_path)
    if storage_root == "import-mount-data":
        result = relative
    else:
        match = GROUP_STORAGE_ROOT.fullmatch(str(storage_root or ""))
        mapping = _group_mappings().get(match.group(1), {}) if match else {}
        folder = mapping.get("folder") if isinstance(mapping, dict) else None
        if not folder:
            raise StoreNotFound("The BIOMERO storage root has no trusted group mapping")
        result = _safe_relative(folder) / relative
    _contained_directory(result)
    return result


def _canonical_annotation_store(image):
    stores = set()
    for owner, values in _ancestry_annotations(image, CANONICAL_PLATE_SOURCE_NAMESPACE):
        try:
            valid = (
                int(values.get("schema", 0)) == 2
                and int(values.get("sourceObjectId", 0)) > 0
                and int(values.get("sourceObjectId", 0)) == int(_string_value(owner, "getId"))
                and int(values.get("sourceGeneration", 0)) > 0
                and int(values.get("imageCount", 0)) > 0
                and int(values.get("labelCount", 0)) >= 0
                and values.get("interchangeProfile")
            )
        except (TypeError, ValueError):
            valid = False
        if valid:
            stores.add(_managed_relative(values.get("storageRoot"), values.get("relativePath")))
    if len(stores) > 1:
        raise AmbiguousStore("The OMERO object refers to multiple canonical OME-Zarr stores")
    return next(iter(stores), None)


def _manifest_routes(shallow_relative):
    shallow_path = _contained_directory(shallow_relative)
    manifest_path = shallow_path / SHALLOW_MANIFEST
    if not manifest_path.is_file():
        return None
    try:
        if manifest_path.stat().st_size > 4 * 1024 * 1024:
            raise StoreNotFound("The shallow manifest exceeds the size limit")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise StoreNotFound("The shallow manifest is invalid") from exc
    if (
        not isinstance(manifest, dict)
        or manifest.get("schema") != 1
        or manifest.get("model") != "rfc8-shallow-copy"
        or not manifest.get("workflowId")
        or not manifest.get("transferArtifact")
        or not manifest.get("interchangeProfile")
    ):
        raise StoreNotFound("The shallow manifest uses an unsupported schema")
    images = manifest.get("images")
    if not isinstance(images, list) or not images or len(images) > 20_000:
        raise StoreNotFound("The shallow manifest has an invalid image list")

    primary = None
    routes = []
    managed_sources = {}

    def managed(source):
        key = (str(source.get("storageRoot") or ""), str(source.get("relativePath") or ""))
        if key not in managed_sources:
            managed_sources[key] = _managed_relative(*key)
        return managed_sources[key]

    for image in images:
        if not isinstance(image, dict):
            raise StoreNotFound("The shallow manifest has an invalid image entry")
        image_node = _safe_relative(image.get("imageNodePath"), allow_dot=True)
        source = image.get("source")
        try:
            valid_source = (
                isinstance(source, dict)
                and int(source.get("schema", 0)) == 1
                and int(source.get("sourceObjectId", 0)) > 0
                and int(source.get("sourceGeneration", 0)) > 0
                and source.get("interchangeProfile")
            )
        except (TypeError, ValueError):
            valid_source = False
        if not valid_source:
            raise StoreNotFound("A shallow image has no canonical source")
        source_base = managed(source)
        source_node = _safe_relative(source.get("nodePath"), allow_dot=True)
        if source_node != image_node:
            raise StoreNotFound("A shallow image source does not match its logical node")
        if primary is None:
            primary = source_base
        elif primary != source_base:
            raise StoreNotFound("A shallow Plate spans multiple canonical stores")

        components = image.get("labelComponents")
        if components is None:
            components = [
                {"logicalNodePath": path}
                for path in image.get("labelNodePaths", [])
            ]
        if not isinstance(components, list):
            raise StoreNotFound("A shallow image has invalid label components")
        seen = set()
        for component in components:
            if not isinstance(component, dict):
                raise StoreNotFound("A shallow label component is invalid")
            logical = _safe_relative(component.get("logicalNodePath"))
            if logical in seen or logical.parts[: len(image_node.parts)] != image_node.parts:
                raise StoreNotFound("A shallow label path is invalid or duplicated")
            seen.add(logical)
            label_source = component.get("source")
            if label_source is None:
                physical = shallow_relative / logical
            elif isinstance(label_source, dict):
                try:
                    valid_label_source = (
                        int(label_source.get("schema", 0)) == 1
                        and int(label_source.get("sourceObjectId", 0)) > 0
                        and int(label_source.get("sourceGeneration", 0)) > 0
                        and label_source.get("interchangeProfile")
                    )
                except (TypeError, ValueError):
                    valid_label_source = False
                if not valid_label_source:
                    raise StoreNotFound("A shallow label source is invalid")
                base = managed(label_source)
                physical = base / _safe_relative(label_source.get("nodePath"))
            else:
                raise StoreNotFound("A shallow label source is invalid")
            # The managed base was resolved and contained above. Individual
            # declared label nodes are checked when metadata or data is read,
            # avoiding dozens of redundant bind-mount stats during Open With.
            routes.append(StoreRoute(logical, physical))
    return primary, tuple(routes)


def resolve_image_store(conn, image_id):
    try:
        image_id = int(image_id)
    except (TypeError, ValueError) as exc:
        raise ObjectNotFound("Image not found") from exc
    image = conn.getObject("Image", image_id)
    if image is None:
        raise ObjectNotFound("Image not found")

    recorded = _recorded_paths(image)
    roots = {root for value in recorded if (root := zarr_ancestor(value)) is not None}
    annotation_fallback = False
    if not roots:
        recorded = _biomero_annotation_paths(image)
        roots = {root for value in recorded if (root := zarr_ancestor(value)) is not None}
        annotation_fallback = bool(roots)
    if not roots:
        canonical = _canonical_annotation_store(image)
        if canonical is None:
            raise StoreNotFound("The image is not backed by an in-place OME-Zarr store")
        path = _contained_directory(canonical)
        image_name = _string_value(image, "getName")
        recorded = [str(canonical / _safe_relative(image_name, allow_dot=True))]
        return ResolvedStore(
            image=image,
            image_id=image_id,
            image_name=image_name,
            path=path,
            relative=canonical,
            recorded_root=canonical,
            recorded_files=tuple(recorded),
        )
    if len(roots) != 1:
        raise AmbiguousStore("The image Fileset refers to multiple OME-Zarr stores")
    recorded_root = next(iter(roots))
    path, relative = _map_recorded_root(recorded_root)
    image_name = _string_value(image, "getName")
    if annotation_fallback and image_name:
        # BIOMERO HCS imports annotate the Plate but name individual OMERO
        # Images with their NGFF field path (for example A/1/0). Include that
        # non-authoritative hint solely for initial-field selection.
        recorded.append(str(recorded_root / PurePosixPath(image_name.replace("\\", "/"))))
    composite = _manifest_routes(relative)
    routes = ()
    shallow = False
    if composite is not None:
        relative, routes = composite
        path = _contained_directory(relative)
        shallow = True
        if image_name:
            recorded.append(str(relative / _safe_relative(image_name, allow_dot=True)))
    return ResolvedStore(
        image=image,
        image_id=image_id,
        image_name=image_name,
        path=path,
        relative=relative,
        recorded_root=recorded_root,
        recorded_files=tuple(recorded),
        routes=routes,
        shallow=shallow,
    )


def resolve_plate_store(conn, plate_id):
    """Resolve a readable OMERO Plate through its first readable field."""
    try:
        plate_id = int(plate_id)
    except (TypeError, ValueError) as exc:
        raise PlateNotFound("Plate not found") from exc
    plate = conn.getObject("Plate", plate_id)
    if plate is None:
        raise PlateNotFound("Plate not found")

    wells = getattr(plate, "listChildren", None)
    if not callable(wells):
        raise StoreNotFound("The plate contains no readable OME-Zarr fields")
    for well in wells():
        samples = getattr(well, "listChildren", None)
        if not callable(samples):
            continue
        for sample in samples():
            get_image = getattr(sample, "getImage", None)
            image = get_image() if callable(get_image) else None
            image_id = _string_value(image, "getId") if image is not None else ""
            if not image_id:
                continue
            try:
                return resolve_image_store(conn, image_id)
            except (ObjectNotFound, StoreNotFound):
                continue
    raise StoreNotFound("The plate contains no readable in-place OME-Zarr fields")
