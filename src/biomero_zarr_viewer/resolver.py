"""Map a readable OMERO Image back to its in-place OME-Zarr store."""

from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from .errors import AmbiguousStore, ObjectNotFound, PlateNotFound, StoreNotFound, UnsafePath
from .settings import mount_root, source_root

BIOMERO_IMPORT_NAMESPACE = "biomero.import"
MAX_PARENT_DEPTH = 4


@dataclass(frozen=True)
class ResolvedStore:
    image: object
    image_id: int
    image_name: str
    path: Path
    relative: PurePosixPath
    recorded_root: PurePosixPath
    recorded_files: tuple[str, ...]


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


def _annotation_values(annotation):
    namespace = _string_value(annotation, "getNs")
    if namespace != BIOMERO_IMPORT_NAMESPACE:
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


def _biomero_annotation_paths(image):
    """Read importer provenance from the readable Image/container ancestry."""
    paths = []
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
                values = list(annotations(ns=BIOMERO_IMPORT_NAMESPACE))
            except TypeError:
                try:
                    values = list(annotations())
                except NotImplementedError:
                    values = ()
            except NotImplementedError:
                # WellSampleWrapper does not implement annotation links, but
                # it remains an important step in Image -> Screen ancestry.
                values = ()
            for annotation in values:
                provenance = _annotation_values(annotation)
                filepath = provenance.get("Filepath", "").replace("\\", "/")
                # Require the stable fields emitted by BIOMERO.importer. The
                # configured-root and canonical containment checks below remain
                # authoritative for the path itself.
                if (
                    filepath
                    and provenance.get("UUID")
                    and provenance.get("DestinationType")
                    and provenance.get("Files")
                ):
                    paths.append(filepath)

        if depth >= MAX_PARENT_DEPTH:
            continue
        parents = getattr(obj, "listParents", None)
        if callable(parents):
            try:
                queue.extend((parent, depth + 1) for parent in list(parents()))
            except NotImplementedError:
                pass
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
        raise StoreNotFound("The image is not backed by an in-place OME-Zarr store")
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
    return ResolvedStore(
        image=image,
        image_id=image_id,
        image_name=image_name,
        path=path,
        relative=relative,
        recorded_root=recorded_root,
        recorded_files=tuple(recorded),
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
