import json

import pytest

from biomero_zarr_viewer.errors import InvalidMetadata, UnsupportedStore
from biomero_zarr_viewer.metadata import inspect_store

from .conftest import write_json, write_v2_image, write_v3_image


def test_reads_v04_image_and_labels(tmp_path):
    root = write_v2_image(tmp_path / "image.ome.zarr")
    model = inspect_store(root)
    assert model["kind"] == "image"
    assert model["ngff_version"] == "0.4"
    assert model["zarr_format"] == 2
    assert model["channels"][0]["label"] == "DNA"
    assert model["labels"][0]["path"] == "labels/nuclei"
    assert model["labels"][0]["color"] == "#FF00FF"


def test_derives_missing_channel_defaults_from_array_shape(tmp_path):
    root = write_v2_image(tmp_path / "metadata-light.ome.zarr")
    attrs = json.loads((root / ".zattrs").read_text(encoding="utf-8"))
    attrs.pop("omero")
    write_json(root / ".zattrs", attrs)
    array = json.loads((root / "0/.zarray").read_text(encoding="utf-8"))
    array["shape"][0] = 3
    write_json(root / "0/.zarray", array)

    model = inspect_store(root)

    assert [channel["label"] for channel in model["channels"]] == [
        "Channel 1",
        "Channel 2",
        "Channel 3",
    ]


def test_reads_v05_image_and_labels(tmp_path):
    root = write_v3_image(tmp_path / "image.zarr")
    model = inspect_store(root)
    assert model["ngff_version"] == "0.5"
    assert model["zarr_format"] == 3
    assert model["labels"][0]["name"] == "cells"


@pytest.mark.parametrize("writer,version", [(write_v2_image, "0.4"), (write_v3_image, "0.5")])
def test_reads_sparse_plate(writer, version, tmp_path):
    root = writer(tmp_path / f"plate-{version}.zarr", plate=True)
    model = inspect_store(root, [f"/recorded/plate-{version}.zarr/A/1/0/0/.zarray"])
    assert model["kind"] == "plate"
    assert model["plate"]["initial_path"] == "A/1/0"
    assert model["labels"]


def test_rejects_non_integer_label(tmp_path):
    root = write_v2_image(tmp_path / "bad.zarr", invalid_label_dtype=True)
    with pytest.raises(InvalidMetadata, match="integer pixels"):
        inspect_store(root)


def test_rejects_unknown_version(tmp_path):
    root = tmp_path / "future.zarr"
    write_json(root / "zarr.json", {"zarr_format": 3, "node_type": "group", "attributes": {"ome": {"version": "0.6", "multiscales": []}}})
    with pytest.raises(UnsupportedStore):
        inspect_store(root)


def test_rejects_v03_on_zarr_v2(tmp_path):
    root = write_v2_image(tmp_path / "old.zarr")
    attrs = json.loads((root / ".zattrs").read_text(encoding="utf-8"))
    attrs["multiscales"][0]["version"] = "0.3"
    write_json(root / ".zattrs", attrs)
    with pytest.raises(UnsupportedStore):
        inspect_store(root)


def test_rejects_unsafe_label_path(tmp_path):
    root = write_v2_image(tmp_path / "unsafe.zarr")
    write_json(root / "labels/.zattrs", {"labels": ["../secret"]})
    with pytest.raises(Exception, match="unsafe"):
        inspect_store(root)
