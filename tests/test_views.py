import json
import shutil
from io import BytesIO
from pathlib import PurePosixPath

import numpy as np
import zarr
from django.test import RequestFactory
from PIL import Image

from biomero_zarr_viewer.tokens import make_read_context
from biomero_zarr_viewer.resolver import StoreRoute
from biomero_zarr_viewer.views import (
    analysis_skill,
    analysis_skills,
    capabilities,
    data,
    image_eligibility,
    plate_capabilities,
    plate_eligibility,
    render_png,
    roi_png,
    viewer,
    well_eligibility,
)

from .conftest import write_v2_image
from .fakes import (
    FakeAnnotation,
    FakeConnection,
    FakeImage,
    FakeOriginalFile,
    FakeParent,
    FakeWellSample,
)


def _request(url, group=13, token=None, method="get", **kwargs):
    headers = {"HTTP_X_OMERO_ZARR_CONTEXT": token} if token else {}
    request = getattr(RequestFactory(), method)(url, **kwargs, **headers)
    request.session = {"active_group": group}
    return request


def _connection(store_name="sample.zarr"):
    image = FakeImage(42, store_name, [FakeOriginalFile(f"/recorded/{store_name}/", ".zattrs")])
    return FakeConnection(image)


def test_analysis_skill_provider_is_versioned_and_hashes_every_file():
    response = analysis_skills(_request("/api/analysis-skills/"), conn=FakeConnection())
    payload = json.loads(response.content)
    assert response.status_code == 200
    assert payload["schema"] == "nl.bioimaging.analysis-skill-provider.v1"
    assert payload["provider"]["name"] == "BIOMERO.ZarrViewer"
    assert payload["skills"][0]["name"] == "use-omero-zarr-viewer"
    assert payload["skills"][0]["required_resources"] == ["references/REFERENCE.md"]

    response = analysis_skill(
        _request("/api/analysis-skills/use-omero-zarr-viewer/"),
        "use-omero-zarr-viewer",
        conn=FakeConnection(),
    )
    package = json.loads(response.content)
    assert {item["path"] for item in package["files"]} == {
        "SKILL.md",
        "references/REFERENCE.md",
    }
    assert all(len(item["sha256"]) == 64 for item in package["files"])


def test_capability_contract(configure_storage):
    _, mount = configure_storage
    store_uuid = "3935615d-a18d-41d8-af04-e63cfec3a46c"
    write_v2_image(mount / "sample.zarr", store_uuid=store_uuid)
    response = capabilities(_request("/api/images/42/capabilities/"), 42, conn=_connection())
    payload = json.loads(response.content)
    assert response.status_code == 200
    assert payload["schema_version"] == 1
    assert payload["supported"] is True
    assert payload["store"]["url"].endswith("/data/images/42/")
    assert payload["store"]["context"]
    assert payload["store"]["uuid"] == store_uuid
    assert payload["store"]["name"] == "sample.zarr"
    assert payload["store"]["roi_url"].endswith("/api/images/42/roi.png")
    assert payload["store"]["render_url"].endswith("/api/images/42/render.png")
    assert "recorded" not in response.content.decode()


def test_capability_hides_unreadable_image(configure_storage):
    response = capabilities(_request("/api/images/1/capabilities/"), 1, conn=FakeConnection())
    assert response.status_code == 404
    assert json.loads(response.content)["error"]["code"] == "image_not_found"


def test_image_eligibility_uses_registration_without_reading_store():
    response = image_eligibility(
        _request("/api/images/42/eligibility/"), 42, conn=_connection()
    )
    assert response.status_code == 200
    assert json.loads(response.content) == {"supported": True}

    response = image_eligibility(
        _request("/api/images/1/eligibility/"), 1, conn=FakeConnection()
    )
    assert json.loads(response.content) == {"supported": False}


def test_eligibility_accepts_official_biomero_import_metadata():
    annotation = FakeAnnotation("biomero.import", {
        "Filepath": "/recorded/not-mounted/sample.ome.zarr",
        "UUID": "3935615d-a18d-41d8-af04-e63cfec3a46c",
        "DestinationType": "plate",
        "Files": "1",
    })
    image = FakeImage(42, "A/1/0", [], annotations=[annotation])
    conn = FakeConnection(image=image)

    response = image_eligibility(
        _request("/api/images/42/eligibility/"), 42, conn=conn
    )

    assert json.loads(response.content) == {"supported": True}


def test_plate_capability_and_viewer_redirect(configure_storage):
    _, mount = configure_storage
    write_v2_image(mount / "plate.zarr", plate=True)
    image = FakeImage(42, "A/1/0", [FakeOriginalFile("/recorded/plate.zarr/A/1/0/", ".zattrs")])
    sample = FakeWellSample(7, image)
    well = FakeParent(8)
    well.listChildren = lambda: [sample]
    plate = FakeParent(9)
    plate.listChildren = lambda: [well]
    conn = FakeConnection(image=image, plate=plate)

    response = plate_capabilities(_request("/api/plates/9/capabilities/"), 9, conn=conn)
    payload = json.loads(response.content)
    assert response.status_code == 200
    assert payload["kind"] == "plate"
    assert payload["image"]["id"] == 42

    redirect_request = _request("/?plate=9")
    redirect_request.GET = redirect_request.GET.copy()
    redirect_request.GET["plate"] = "9"
    redirect = viewer(redirect_request, conn=conn)
    assert redirect.status_code == 302
    assert redirect["Location"].endswith("?image=42")

    eligible = plate_eligibility(
        _request("/api/plates/9/eligibility/"), 9, conn=conn
    )
    assert json.loads(eligible.content) == {"supported": True}


def test_well_eligibility_and_viewer_redirect_to_well_overview(configure_storage):
    _, mount = configure_storage
    write_v2_image(mount / "plate.zarr", plate=True)
    image = FakeImage(42, "A/1/0", [
        FakeOriginalFile("/recorded/plate.zarr/A/1/0/", ".zattrs")
    ])
    well = FakeParent(2351)
    well.listChildren = lambda: [FakeWellSample(7, image)]
    conn = FakeConnection(image=image, well=well)

    eligible = well_eligibility(
        _request("/api/wells/2351/eligibility/"), 2351, conn=conn
    )
    assert json.loads(eligible.content) == {"supported": True}

    request = _request("/?well=2351")
    request.GET = request.GET.copy()
    request.GET["well"] = "2351"
    redirect = viewer(request, conn=conn)
    assert redirect.status_code == 302
    assert redirect["Location"].endswith("?image=42&v=2&view=well")


def test_shallow_plate_capability_combines_canonical_pixels_and_result_labels(
    configure_storage, monkeypatch, tmp_path
):
    source, mount = configure_storage
    mapping = tmp_path / "groups.json"
    mapping.write_text(json.dumps({"13": {"folder": "Project A"}}), encoding="utf-8")
    monkeypatch.setenv("OMERO_BIOMERO_GROUP_MAPPINGS_FILE", str(mapping))
    canonical = write_v2_image(
        mount / "Project A/canonical/plate.ome.zarr", plate=True
    )
    shallow = mount / "Project A/results/plate.ome.zarr"
    label_path = "A/1/0/labels/nuclei"
    shutil.copytree(canonical / label_path, shallow / label_path)
    shutil.rmtree(canonical / "A/1/0/labels")
    (shallow / ".biomero-shallow.json").write_text(json.dumps({
        "schema": 1, "model": "rfc8-shallow-copy",
        "workflowId": "00000000-0000-4000-8000-000000000001",
        "transferArtifact": "plate.ome.zarr",
        "interchangeProfile": "ngff-0.4-zarr-v2",
        "images": [{
            "imageNodePath": "A/1/0",
            "source": {
                "schema": 1, "storageRoot": "group-13-data",
                "relativePath": "canonical/plate.ome.zarr", "nodePath": "A/1/0",
                "sourceObjectId": 9, "sourceGeneration": 1,
                "interchangeProfile": "ngff-0.4-zarr-v2",
            },
            "labelNodePaths": [label_path],
            "labelComponents": [{"logicalNodePath": label_path, "source": None}],
        }],
    }), encoding="utf-8")
    image = FakeImage(42, "A/1/0", [FakeOriginalFile(
        f"{source}/Project A/results/plate.ome.zarr/", ".zattrs"
    )])
    conn = FakeConnection(image)

    response = capabilities(_request("/api/images/42/capabilities/"), 42, conn=conn)
    payload = json.loads(response.content)

    assert response.status_code == 200
    assert payload["kind"] == "plate"
    assert payload["composite_store"] is True
    assert [label["path"] for label in payload["labels"]] == [label_path]
    routed = data(
        _request("/", token=payload["store"]["context"]),
        42, f"{label_path}/.zattrs", conn=conn,
    )
    assert routed["X-Accel-Redirect"].endswith(
        "/Project%20A/results/plate.ome.zarr/A/1/0/labels/nuclei/.zattrs"
    )


def test_data_uses_internal_redirect_without_body(configure_storage):
    _, mount = configure_storage
    write_v2_image(mount / "sample.zarr")
    conn = _connection()
    token, _ = make_read_context(_request("/"), conn, 42, "sample.zarr")
    response = data(_request("/data/images/42/.zattrs", token=token), 42, ".zattrs", conn=conn)
    assert response.status_code == 200
    assert response.content == b""
    assert response["X-Accel-Redirect"] == "/_protected_zarr/sample.zarr/.zattrs"
    assert int(response["Content-Length"]) > 0


def test_data_routes_declared_shallow_label_to_result_store(configure_storage):
    _, mount = configure_storage
    write_v2_image(mount / "canonical.zarr")
    label = mount / "result.zarr/A/1/0/labels/nuclei"
    label.mkdir(parents=True)
    (label / ".zattrs").write_text("{}", encoding="utf-8")
    conn = _connection("canonical.zarr")
    token, _ = make_read_context(
        _request("/"), conn, 42, "canonical.zarr",
        [StoreRoute(
            logical=PurePosixPath("A/1/0/labels/nuclei"),
            physical=PurePosixPath("result.zarr/A/1/0/labels/nuclei"),
        )],
    )

    response = data(
        _request("/", token=token), 42,
        "A/1/0/labels/nuclei/.zattrs", conn=conn,
    )

    assert response.status_code == 200
    assert response["X-Accel-Redirect"] == "/_protected_zarr/result.zarr/A/1/0/labels/nuclei/.zattrs"


def test_data_rejects_traversal(configure_storage):
    _, mount = configure_storage
    write_v2_image(mount / "sample.zarr")
    conn = _connection()
    token, _ = make_read_context(_request("/"), conn, 42, "sample.zarr")
    response = data(_request("/", token=token), 42, "../secret", conn=conn)
    assert response.status_code == 400
    assert json.loads(response.content)["error"]["code"] == "unsafe_zarr_path"


def test_data_requires_context(configure_storage):
    response = data(_request("/"), 42, ".zattrs", conn=_connection())
    assert response.status_code == 401


def _create_test_array(group, name, *, data, chunks):
    if hasattr(group, "create_array"):
        return group.create_array(name, data=data, chunks=chunks)
    return group.create_dataset(name, data=data, chunks=chunks)


def _write_renderable_store(path):
    store_uuid = "3935615d-a18d-41d8-af04-e63cfec3a46c"
    if int(zarr.__version__.partition(".")[0]) >= 3:
        root = zarr.open_group(str(path), mode="w", zarr_format=2)
    else:
        root = zarr.open_group(str(path), mode="w")
    axes = [
        {"name": "t", "type": "time"},
        {"name": "c", "type": "channel"},
        {"name": "z", "type": "space"},
        {"name": "y", "type": "space"},
        {"name": "x", "type": "space"},
    ]
    image_multiscales = [{
        "version": "0.4",
        "name": "Image",
        "axes": axes,
        "datasets": [{"path": "0"}],
    }]
    intensity = np.zeros((2, 3, 2, 8, 8), dtype=np.uint16)
    intensity[1, 0, 1] = np.arange(64, dtype=np.uint16).reshape(8, 8) * 4
    intensity[1, 1, 1] = 64
    intensity[1, 2, 1, 2:6, 2:6] = 7
    labels = np.zeros((2, 1, 2, 8, 8), dtype=np.uint32)
    labels[1, 0, 1, 2:6, 2:6] = 7
    foci = np.zeros((2, 1, 2, 8, 8), dtype=np.uint32)
    for label_value, (y, x) in zip(
        (332, 337, 349, 353), ((2, 2), (2, 5), (5, 2), (5, 5))
    ):
        foci[1, 0, 1, y, x] = label_value
    _create_test_array(root, "0", data=intensity, chunks=(1, 1, 1, 4, 4))
    root.attrs.update(
        {
            "multiscales": image_multiscales,
            "omero": {
                "channels": [
                    {
                        "label": "DNA",
                        "color": "FF0000",
                        "active": True,
                        "window": {"min": 0, "max": 255, "start": 0, "end": 255},
                    },
                    {
                        "label": "Signal",
                        "color": "00FF00",
                        "active": False,
                        "window": {"min": 0, "max": 255, "start": 0, "end": 255},
                    },
                    {
                        "label": "Cells",
                        "color": "FFFF00",
                        "active": False,
                        "window": {"min": 0, "max": 255, "start": 0, "end": 255},
                    },
                ]
            },
            "cisegmentation": {"output_store_uuid": store_uuid},
        }
    )
    root.create_group("labels")
    root["labels"].attrs["labels"] = ["cells", "foci"]
    label_group = root.create_group("labels/cells")
    label_group.attrs.update(
        {
            "multiscales": [{
                "version": "0.4",
                "name": "Cells",
                "axes": axes,
                "datasets": [{"path": "0"}],
            }],
            "image-label": {"color": [255, 255, 0, 255]},
        }
    )
    _create_test_array(label_group, "0", data=labels, chunks=(1, 1, 1, 4, 4))
    foci_group = root.create_group("labels/foci")
    foci_group.attrs.update(
        {
            "multiscales": [{
                "version": "0.4",
                "name": "Foci",
                "axes": axes,
                "datasets": [{"path": "0"}],
            }],
            "image-label": {"color": [255, 0, 255, 255]},
        }
    )
    _create_test_array(foci_group, "0", data=foci, chunks=(1, 1, 1, 4, 4))
    return store_uuid


def test_roi_png_renders_channel_and_selected_label(configure_storage):
    _, mount = configure_storage
    store_uuid = _write_renderable_store(mount / "sample.zarr")
    request = _request(
        "/api/images/42/roi.png"
        f"?field=.&roi=1,1,7,7&sourceChannels=1&labelPath=labels/cells"
        f"&labelValue=7&t=1&z=1&storeUuid={store_uuid}"
    )
    response = roi_png(request, 42, conn=_connection())
    assert response.status_code == 200
    assert response["Content-Type"] == "image/png"
    image = Image.open(BytesIO(response.content))
    assert image.size == (6, 6)
    pixels = np.asarray(image)
    assert tuple(pixels[1, 1]) == (255, 255, 0)
    assert pixels[2, 2, 0] > 0
    assert pixels[2, 2, 1] == 255


def test_roi_png_supports_an_appended_label_channel(configure_storage):
    _, mount = configure_storage
    _write_renderable_store(mount / "sample.zarr")
    response = roi_png(
        _request(
            "/api/images/42/roi.png"
            "?roi=1,1,7,7&sourceChannels=1&labelChannel=3"
            "&labelValue=7&t=1&z=1"
        ),
        42,
        conn=_connection(),
    )
    assert response.status_code == 200
    pixels = np.asarray(Image.open(BytesIO(response.content)))
    assert tuple(pixels[1, 1]) == (255, 255, 0)


def test_roi_png_rejects_store_mismatch_and_invalid_bounds(configure_storage):
    _, mount = configure_storage
    _write_renderable_store(mount / "sample.zarr")
    mismatch = roi_png(
        _request(
            "/api/images/42/roi.png?roi=0,0,4,4"
            "&storeUuid=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        ),
        42,
        conn=_connection(),
    )
    assert mismatch.status_code == 409
    assert json.loads(mismatch.content)["error"]["code"] == "store_uuid_mismatch"

    invalid = roi_png(
        _request("/api/images/42/roi.png?roi=0,0,99,99"),
        42,
        conn=_connection(),
    )
    assert invalid.status_code == 400
    assert json.loads(invalid.content)["error"]["code"] == "invalid_roi"


def test_render_png_composes_gallery_and_reuses_label_plane(
    configure_storage, monkeypatch
):
    _, mount = configure_storage
    store_uuid = _write_renderable_store(mount / "sample.zarr")
    from biomero_zarr_viewer import roi

    original_plane = roi._plane
    reads = []

    def counted_plane(*args, **kwargs):
        reads.append((str(getattr(args[0], "path", "")), args[2]))
        return original_plane(*args, **kwargs)

    monkeypatch.setattr(roi, "_plane", counted_plane)
    recipe = {
        "storeUuid": store_uuid,
        "title": "Top review candidates",
        "layout": {"columns": 2},
        "panels": [
            {
                "field": ".",
                "roi": [1, 1, 7, 7],
                "sourceChannels": [1],
                "t": 1,
                "z": 1,
                "title": "Cell 7",
                "caption": "foci=4",
                "overlays": [
                    {
                        "labelPath": "labels/cells",
                        "values": [7],
                        "mode": "outline",
                        "color": "#FFFF00",
                        "outlineWidth": 2,
                        "name": "cell",
                    },
                    {
                        "labelPath": "labels/foci",
                        "values": [332, 337, 349, 353],
                        "mode": "outline-fill",
                        "color": "#FF00FF",
                        "opacity": 0.7,
                        "outlineWidth": 2,
                        "name": "foci",
                    },
                ],
            },
            {
                "field": ".",
                "roi": [0, 0, 4, 4],
                "channels": [
                    {"index": 1, "color": "#FF0000", "low": 0, "high": 255}
                ],
                "t": 1,
                "z": 1,
                "title": "Peer",
                "overlays": [],
            },
        ],
    }
    response = render_png(
        _request(
            "/api/images/42/render.png",
            method="post",
            data=json.dumps(recipe),
            content_type="application/json",
        ),
        42,
        conn=_connection(),
    )
    assert response.status_code == 200
    assert response["Content-Type"] == "image/png"
    gallery = Image.open(BytesIO(response.content))
    assert gallery.width == 12
    assert gallery.height > 6
    cell_reads = [item for item in reads if "labels/cells" in item[0]]
    foci_reads = [item for item in reads if "labels/foci" in item[0]]
    assert len(cell_reads) == 1
    assert len(foci_reads) == 1


def test_render_png_enforces_gallery_limits(configure_storage):
    _, mount = configure_storage
    _write_renderable_store(mount / "sample.zarr")
    panel = {"roi": [0, 0, 2, 2], "sourceChannels": [1]}
    response = render_png(
        _request(
            "/api/images/42/render.png",
            method="post",
            data=json.dumps({"panels": [panel] * 26}),
            content_type="application/json",
        ),
        42,
        conn=_connection(),
    )
    assert response.status_code == 413
    assert json.loads(response.content)["error"]["code"] == "roi_limit_exceeded"
