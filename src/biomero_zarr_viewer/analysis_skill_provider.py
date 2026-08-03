"""Authenticated, immutable Analysis skill packages bundled with ZarrViewer."""

from __future__ import annotations

import hashlib
from pathlib import Path

from django.urls import reverse

from . import __version__

PROVIDER_SCHEMA = "nl.bioimaging.analysis-skill-provider.v1"
SKILL_NAME = "use-omero-zarr-viewer"
SKILL_VERSION = "3"
SKILL_ROOT = Path(__file__).with_name("analysis_skills") / SKILL_NAME
REQUIRED_RESOURCES = ("references/REFERENCE.md",)
REQUIRED_CAPABILITIES = ("zarr-render-v2", "zarr-gallery-v1")


def _files():
    values = []
    for path in (SKILL_ROOT / "SKILL.md", SKILL_ROOT / "references/REFERENCE.md"):
        content = path.read_bytes()
        values.append(
            {
                "path": path.relative_to(SKILL_ROOT).as_posix(),
                "media_type": "text/markdown",
                "size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
                "content": content.decode("utf-8"),
            }
        )
    return values


def _package_hash(files):
    digest = hashlib.sha256()
    for item in files:
        digest.update(item["path"].encode("utf-8"))
        digest.update(bytes.fromhex(item["sha256"]))
    return digest.hexdigest()


def descriptor():
    files = _files()
    return {
        "name": SKILL_NAME,
        "description": (
            "Open measured objects in OMERO ZarrViewer and render bounded ROI "
            "PNGs through authenticated host capabilities."
        ),
        "purpose": "application-operation",
        "consumers": ["omero-analysis"],
        "version": SKILL_VERSION,
        "sha256": _package_hash(files),
        "package_url": reverse(
            "biomero_zarr_viewer_analysis_skill",
            kwargs={"skill_name": SKILL_NAME},
        ),
        "required_resources": list(REQUIRED_RESOURCES),
        "required_capabilities": list(REQUIRED_CAPABILITIES),
        "match": {
            "extensions": [],
            "filename_globs": [],
            "required_tables": [],
            "auto_activate": False,
        },
    }


def catalog_payload():
    return {
        "schema": PROVIDER_SCHEMA,
        "provider": {
            "name": "BIOMERO.ZarrViewer",
            "distribution": "biomero-zarr-viewer",
            "version": __version__,
            "source": "bundled",
            "health": "ready",
        },
        "skills": [descriptor()],
    }


def package_payload():
    files = _files()
    return {
        "schema": PROVIDER_SCHEMA,
        "provider": catalog_payload()["provider"],
        "skill": {**descriptor(), "sha256": _package_hash(files)},
        "files": files,
    }
