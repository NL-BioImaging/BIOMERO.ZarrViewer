import json
from types import SimpleNamespace

from biomero_zarr_viewer.metadata_details import omero_details, zarr_details
from biomero_zarr_viewer.views import metadata_details, _safe_data_path
from .conftest import write_json, write_v2_image, write_v3_image
from .fakes import FakeAnnotation, FakeParent
from .test_views import _request, _connection


def test_endpoint_reads_all_metadata_without_reading_pixel_chunks(configure_storage):
    _, mount = configure_storage
    root = mount / "sample.zarr"
    write_v2_image(root)
    write_json(root / "custom" / ".zattrs", {"experiment": {"treatment": "control"}})
    # Chunk-looking subdirectories must never be traversed inside arrays.
    write_json(root / "0" / "chunks" / ".zattrs", {"must_not_read": True})
    conn = _connection()
    conn.image.annotations.append(FakeAnnotation("example.metadata", {"compound": "DMSO"}))
    conn.image.parents.append(FakeParent(7, "Study", [FakeAnnotation("study.metadata", {"Batch": "A"})]))
    response = metadata_details(_request("/metadata/"), 42, conn=conn)
    payload = json.loads(response.content)
    assert response.status_code == 200
    assert response["Cache-Control"] == "private, no-store"
    nodes = {node["path"]: node for node in payload["zarr"]["nodes"]}
    assert nodes["custom"]["attributes"]["experiment"]["treatment"] == "control"
    assert "0/chunks" not in nodes
    assert nodes["0"]["array"]["shape"]
    assert payload["omero"]["annotations"][0]["value"] == [["compound", "DMSO"]]
    assert payload["omero"]["ancestors"][0]["annotations"][0]["value"] == [["Batch", "A"]]
    assert "/recorded/" not in response.content.decode()


def test_endpoint_requires_readable_image(configure_storage):
    response = metadata_details(_request("/metadata/"), 99, conn=_connection())
    assert response.status_code == 404


def test_v3_metadata_preserves_custom_attributes(configure_storage):
    _, mount = configure_storage
    root = mount / "sample.zarr"
    write_v3_image(root)
    response = metadata_details(_request("/metadata/"), 42, conn=_connection())
    payload = json.loads(response.content)
    assert response.status_code == 200
    assert payload["zarr"]["format"] == 3
    assert all("zarr.json" in node["documents"] for node in payload["zarr"]["nodes"])
    assert any(node["array"] for node in payload["zarr"]["nodes"])


def test_metadata_routes_respect_composite_mapping(configure_storage):
    _, mount = configure_storage
    write_json(mount / "root.zarr" / ".zattrs", {"custom": "root"})
    write_json(mount / "labels.zarr" / ".zattrs", {"image-label": {"version": "0.4"}})
    store = SimpleNamespace(relative="root.zarr", routes=[SimpleNamespace(logical=__import__("pathlib").PurePosixPath("labels/cells"), physical=__import__("pathlib").PurePosixPath("labels.zarr"))])
    nodes = zarr_details(store, _safe_data_path)["nodes"]
    assert {node["path"] for node in nodes} == {".", "labels/cells"}


def test_annotation_duplicate_keys_and_partial_omero_failures_are_preserved():
    class Annotation:
        def getValue(self): return [("Key", "one"), ("Key", "two")]
    class Image:
        def getId(self): return 42
        def getName(self): return "Image"
        def listAnnotations(self): return [Annotation()]
        def getInstrument(self): raise RuntimeError("not readable")
    result = omero_details(Image())
    assert result["annotations"][0]["value"] == [["Key", "one"], ["Key", "two"]]
    assert any("Instrument" in notice for notice in result["notices"])


def test_omero_dimensions_units_and_timing_are_read_without_render_engine():
    class Length:
        def getValue(self): return .5
        def getUnit(self): return "MICROMETER"
    class Pixels:
        def getSizeX(self): return 271
        def getPhysicalSizeX(self): return Length()
        def copyPlaneInfo(self): return []
    class Image:
        def getPrimaryPixels(self): return Pixels()
        def getChannels(self, noRE=False):
            assert noRE
            return []
    result = omero_details(Image())
    assert result["pixels"]["size_X"] == 271
    assert result["pixels"]["physical_size_X"] == {"value": .5, "unit": "MICROMETER"}
    assert result["planes"] == []


def test_plate_well_and_field_metadata_are_included(configure_storage):
    _, mount = configure_storage
    write_v2_image(mount / "sample.zarr", plate=True)
    response = metadata_details(_request("/metadata/"), 42, conn=_connection())
    payload = json.loads(response.content)
    assert response.status_code == 200
    assert payload["zarr"]["kind"] == "plate"
    assert any("plate" in node["attributes"] for node in payload["zarr"]["nodes"])
    assert any("well" in node["attributes"] for node in payload["zarr"]["nodes"])
    assert any("/" in node["path"] and "multiscales" in node["attributes"] for node in payload["zarr"]["nodes"])
