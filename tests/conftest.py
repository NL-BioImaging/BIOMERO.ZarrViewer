import json
import sys
from pathlib import Path

import django
import pytest
from django.conf import settings

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

if not settings.configured:
    settings.configure(
        SECRET_KEY="test-secret-key",
        DEBUG=True,
        ROOT_URLCONF="biomero_zarr_viewer.urls",
        ALLOWED_HOSTS=["testserver"],
        MIDDLEWARE=[],
        INSTALLED_APPS=[
            "django.contrib.auth",
            "django.contrib.contenttypes",
            "biomero_zarr_viewer",
        ],
        TEMPLATES=[
            {
                "BACKEND": "django.template.backends.django.DjangoTemplates",
                "APP_DIRS": True,
            }
        ],
    )
django.setup()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def multiscales(version, name="Image"):
    return [
        {
            "version": version,
            "name": name,
            "axes": [
                {"name": "c", "type": "channel"},
                {"name": "y", "type": "space", "unit": "micrometer"},
                {"name": "x", "type": "space", "unit": "micrometer"},
            ],
            "datasets": [
                {
                    "path": "0",
                    "coordinateTransformations": [
                        {"type": "scale", "scale": [1, 0.5, 0.5]}
                    ],
                }
            ],
        }
    ]


def display_metadata():
    return {
        "channels": [
            {
                "label": "DNA",
                "color": "00FF00",
                "active": True,
                "window": {"min": 0, "max": 65535, "start": 100, "end": 2000},
            }
        ]
    }


def write_v2_image(
    root, *, plate=False, invalid_label_dtype=False, store_uuid=None
):
    write_json(root / ".zgroup", {"zarr_format": 2})
    if plate:
        write_json(
            root / ".zattrs",
            {
                "plate": {
                    "version": "0.4",
                    "name": "Demo plate",
                    "rows": [{"name": "A"}, {"name": "B"}],
                    "columns": [{"name": "1"}, {"name": "2"}],
                    "wells": [
                        {"path": "A/1", "rowIndex": 0, "columnIndex": 0},
                        {"path": "B/2", "rowIndex": 1, "columnIndex": 1},
                    ],
                    "acquisitions": [{"id": 0, "name": "First"}],
                },
                **(
                    {"cisegmentation": {"output_store_uuid": store_uuid}}
                    if store_uuid
                    else {}
                ),
            },
        )
        write_json(root / "A/1/.zattrs", {"well": {"images": [{"path": "0", "acquisition": 0}]}})
        write_json(root / "B/2/.zattrs", {"well": {"images": []}})
        image = root / "A/1/0"
        write_json(image / ".zgroup", {"zarr_format": 2})
    else:
        image = root
    attrs = {
        "multiscales": multiscales("0.4"),
        "omero": display_metadata(),
        **(
            {"cisegmentation": {"output_store_uuid": store_uuid}}
            if store_uuid and not plate
            else {}
        ),
    }
    if plate:
        write_json(image / ".zattrs", attrs)
    else:
        write_json(root / ".zattrs", attrs)
    write_json(image / "0/.zarray", {"zarr_format": 2, "shape": [1, 16, 16], "chunks": [1, 8, 8], "dtype": "<u2"})
    (image / "0/0.0.0").write_bytes(b"pixels")
    write_json(image / "labels/.zattrs", {"labels": ["nuclei"]})
    write_json(image / "labels/nuclei/.zattrs", {"multiscales": multiscales("0.4", "Nuclei"), "image-label": {"color": [255, 0, 255, 255], "opacity": 0.6}})
    write_json(image / "labels/nuclei/0/.zarray", {"zarr_format": 2, "shape": [1, 16, 16], "chunks": [1, 8, 8], "dtype": "<f4" if invalid_label_dtype else "<u4"})
    return root


def write_v3_image(root, *, plate=False):
    if plate:
        ome = {
            "version": "0.5",
            "plate": {
                "version": "0.5",
                "name": "V3 plate",
                "rows": [{"name": "A"}],
                "columns": [{"name": "1"}],
                "wells": [{"path": "A/1", "rowIndex": 0, "columnIndex": 0}],
            },
        }
    else:
        ome = {"version": "0.5", "multiscales": multiscales("0.5"), "omero": display_metadata()}
    write_json(root / "zarr.json", {"zarr_format": 3, "node_type": "group", "attributes": {"ome": ome}})
    image = root
    if plate:
        write_json(root / "A/1/zarr.json", {"zarr_format": 3, "node_type": "group", "attributes": {"ome": {"well": {"version": "0.5", "images": [{"path": "0"}]}}}})
        image = root / "A/1/0"
        write_json(image / "zarr.json", {"zarr_format": 3, "node_type": "group", "attributes": {"ome": {"version": "0.5", "multiscales": multiscales("0.5"), "omero": display_metadata()}}})
    write_json(image / "0/zarr.json", {"zarr_format": 3, "node_type": "array", "shape": [1, 16, 16], "data_type": "uint16", "chunk_grid": {"name": "regular", "configuration": {"chunk_shape": [1, 8, 8]}}, "chunk_key_encoding": {"name": "default", "configuration": {"separator": "/"}}, "codecs": [], "fill_value": 0, "attributes": {}})
    write_json(image / "labels/zarr.json", {"zarr_format": 3, "node_type": "group", "attributes": {"ome": {"version": "0.5", "labels": ["cells"]}}})
    write_json(image / "labels/cells/zarr.json", {"zarr_format": 3, "node_type": "group", "attributes": {"ome": {"version": "0.5", "multiscales": multiscales("0.5", "Cells"), "image-label": {"opacity": 0.5}}}})
    write_json(image / "labels/cells/0/zarr.json", {"zarr_format": 3, "node_type": "array", "shape": [1, 16, 16], "data_type": "uint32", "chunk_grid": {"name": "regular", "configuration": {"chunk_shape": [1, 8, 8]}}, "chunk_key_encoding": {"name": "default", "configuration": {"separator": "/"}}, "codecs": [], "fill_value": 0, "attributes": {}})
    return root


@pytest.fixture
def configure_storage(monkeypatch, tmp_path):
    source = "/recorded"
    mount = tmp_path / "mount"
    mount.mkdir()
    monkeypatch.setattr("biomero_zarr_viewer.settings.BIOMERO_ZARR_SOURCE_ROOT", source, raising=False)
    monkeypatch.setattr("biomero_zarr_viewer.settings.BIOMERO_ZARR_MOUNT_ROOT", str(mount), raising=False)
    monkeypatch.setattr("biomero_zarr_viewer.settings.BIOMERO_ZARR_INTERNAL_PREFIX", "/_protected_zarr/", raising=False)
    return source, mount
