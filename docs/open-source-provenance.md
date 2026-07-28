# Open-source provenance and project attribution

This document records the source projects, specifications, and products that
influenced BIOMERO OME-Zarr Viewer. It distinguishes:

- code and libraries included as runtime dependencies;
- code and patterns adapted from another NL-BioImaging project;
- repositories and applications consulted only as references; and
- functionality designed and implemented specifically for this project.

The inventory describes version `0.4.1` and was reviewed on 28 July 2026.
The dependency manifests and lock files remain authoritative for exact versions.

## Summary

BIOMERO OME-Zarr Viewer is an
[AGPL-3.0-or-later](../LICENSE) OMERO.web application developed by
NL-BioImaging. The viewer is not a fork of OMERO-Vitessce,
`ome/omero-web-zarr`, or Find Nuclei Viewer.

The closest source-code lineage is
[NL-BioImaging/OMERO.JupyterLite](https://github.com/NL-BioImaging/OMERO.JupyterLite).
Its OMERO authentication, signed-context, packaging, and Docker extension
patterns were adapted for authenticated OME-Zarr access. The image viewer,
NGFF metadata adapters, BIOMERO store resolution, Zarr data gateway, label
renderer, multidimensional controls, and HCS navigation were implemented in
this repository.

## How the sources are classified

| Classification | Meaning in this document |
| --- | --- |
| Runtime dependency | Third-party code imported by Python or JavaScript and used by the running application. |
| Adapted code or pattern | An upstream implementation has identifiable structural or code lineage in this repository. |
| Reference only | The project was inspected, tested, or used to inform a design decision, but its source files were not copied into this repository. |
| Specification | A published interoperability standard implemented by this project; it is not a software dependency. |
| Project-specific work | Code designed and implemented for BIOMERO OME-Zarr Viewer. |

Public access to source code does not by itself make a repository open source.
The license of every reference therefore matters. In particular, Find Nuclei
Viewer was a visual reference but is published as “all rights reserved,” and
the deployment kit did not contain an explicit software license when this
inventory was reviewed.

## Adapted source-code lineage

### NL-BioImaging/OMERO.JupyterLite

Source:
[NL-BioImaging/OMERO.JupyterLite](https://github.com/NL-BioImaging/OMERO.JupyterLite)
(AGPL-3.0-or-later)

OMERO.JupyterLite is a sibling NL-BioImaging OMERO.web extension. The following
established patterns were adapted:

- OMERO user and active-group discovery;
- short-lived Django-signed contexts bound to the authenticated OMERO session;
- a versioned, operation-limited token payload;
- OMERO.web plugin configuration and packaged static assets;
- wheel construction with a frontend build;
- Docker plugin installation, update, removal, status, static cleanup, and
  OMERO.web restart handling; and
- composable installation that preserves other OMERO.web extensions.

The most direct corresponding files are:

- [`tokens.py`](../src/biomero_zarr_viewer/tokens.py), customized with an
  OME-Zarr-specific signing salt, image and store claims, a read-only operation,
  and the `X-OMERO-Zarr-Context` header;
- [`manage-docker-plugin.ps1`](../scripts/manage-docker-plugin.ps1), adapted
  for the viewer's wheel, OMERO configuration, static bundle, Nginx validation,
  and co-installation behavior; and
- the project packaging and Docker build files, adapted to deliver the React
  production bundle as part of an OMERO.web extension.

The Zarr path resolver, capability model, data routes, NGFF parsing, and viewer
UI are not inherited from OMERO.JupyterLite.

## Included runtime dependencies

These are direct application dependencies. Each remains subject to its own
upstream license. Transitive frontend dependencies and their resolved versions
are recorded in [`frontend/package-lock.json`](../frontend/package-lock.json).

### Python and OMERO

| Project | Use in this project | Declared version | Upstream license |
| --- | --- | --- | --- |
| [OMERO.web](https://github.com/ome/omero-web) | OMERO.web application framework, authenticated connection and group context, model access, routing, templates, and Open With integration | `>=5.6.0` | GPL-2.0-or-later |
| [NumPy](https://github.com/numpy/numpy) | Numeric array handling for server-side previews, ROI rendering, and projections | `>=1.24,<3` | BSD-3-Clause |
| [Pillow](https://github.com/python-pillow/Pillow) | PNG composition and encoding for server-rendered overview and ROI images | `>=10,<13` | HPND |
| [Zarr-Python](https://github.com/zarr-developers/zarr-python) | Reading Zarr metadata and bounded array regions for server-rendered views | `>=2.18,<4` | MIT |

[Django](https://github.com/django/django) is supplied through the OMERO.web
environment and is also installed directly for tests. It provides URL routing,
views, responses, configuration, templates, and cryptographic signing.

### Browser viewer

| Project | Use in this project | Locked direct version | Upstream license |
| --- | --- | --- | --- |
| [Viv](https://github.com/hms-dbmi/viv) | GPU-backed multiscale OME-NGFF image layers and loaders | `0.22.0` | MIT |
| [Zarrita](https://github.com/manzt/zarrita.js) | Zarr v2/v3 hierarchy access with a custom authenticated fetch store | `0.7.3` | MIT |
| [deck.gl](https://github.com/visgl/deck.gl) | WebGL canvas, views, interaction, and layer composition used by Viv and the custom label extension | `9.3.7` | MIT |
| [React](https://github.com/facebook/react) | Viewer interface and application state | `19.2.8` | MIT |

Vite, TypeScript, Vitest, Testing Library, and jsdom are development and test
tools. They are declared in
[`frontend/package.json`](../frontend/package.json), but are not required on
the production OMERO.web host after the bundle and wheel have been built.

Nginx is deployment infrastructure rather than a packaged application
dependency. An existing deployment Nginx instance processes the viewer's
authenticated `X-Accel-Redirect` responses and serves chunk bytes from the
read-only OME-Zarr mount.

## Specifications implemented

The metadata adapters implement the
[OME-NGFF specifications](https://ngff.openmicroscopy.org/specifications/),
including OME-Zarr 0.4 with Zarr v2 and OME-Zarr 0.5 with Zarr v3. The
specifications informed:

- multiscale dataset and axis interpretation;
- channel display metadata;
- image and HCS plate hierarchies;
- rows, columns, wells, acquisitions, and fields;
- label group discovery and label display metadata; and
- relative source-image relationships.

The NGFF specification is an interoperability reference, not source code copied
into the viewer.

## Reference-only repositories and applications

### OMERO-Vitessce

Source:
[NFDI4BIOIMAGE/omero-vitessce](https://github.com/NFDI4BIOIMAGE/omero-vitessce)
(AGPL-3.0)

OMERO-Vitessce was used for the initial compatibility spike. Its behavior was
compared against representative OME-Zarr image, label, and plate stores,
especially authenticated loading, nearest-neighbour mask sampling, and
bitmask-based label rendering. The findings are recorded in
[`compatibility-spike.md`](compatibility-spike.md).

Vitessce is not a production dependency, and no OMERO-Vitessce source file is
included in the viewer. Production rendering uses Viv, Zarrita, deck.gl, and a
viewer-specific label shader.

### ome/omero-web-zarr

Source:
[ome/omero-web-zarr](https://github.com/ome/omero-web-zarr) (AGPL-3.0)

This project was reviewed as an example of exposing OMERO data through a
Zarr-compatible web interface. It was an architectural comparison only:

- `ome/omero-web-zarr` virtualizes conventional OMERO pixels as Zarr data;
- BIOMERO OME-Zarr Viewer resolves already-existing BIOMERO OME-Zarr stores
  and authorizes their bytes through an Nginx internal location.

The viewer neither imports nor copies `ome/omero-web-zarr` code. The two
projects solve complementary problems.

### Find Nuclei Viewer

Sources:
[Find Nuclei Viewer](https://find-nuclei.github.io/) and its
[public source repository](https://github.com/Find-Nuclei/find-nuclei.github.io)

Find Nuclei Viewer was used as a product and visual-interaction reference during
iterative UI work. Screenshots and a running public instance informed the
general direction of:

- one viewer canvas with one side panel;
- Channels and Labels tabs;
- histogram and display-range controls;
- Auto, Fit, and Hist actions;
- field, well, and plate navigation modes;
- navigator, scale, and fullscreen controls; and
- slice, maximum, mean, and minimum projection choices.

These concepts were independently implemented for OMERO authentication, Viv,
Zarrita, and this project's capability model. No Find Nuclei source code,
stylesheets, icons, or other assets were copied.

The repository's license states “Copyright (c) 2025 Find Nuclei. All rights
reserved.” It is therefore a public source reference, not an open-source code
dependency.

### NL-BIOMERO

Source:
[NL-BioImaging/NL-BIOMERO](https://github.com/NL-BioImaging/NL-BIOMERO)
(BSD-2-Clause license text in the upstream repository)

NL-BIOMERO was used to understand BIOMERO's Compose topology, shared data
mounts, OMERO.web configuration, and existing Nginx service. That informed
[`deployment-nl-biomero.md`](deployment-nl-biomero.md) and the decision to add
the viewer to the existing Nginx instance instead of deploying a second proxy.

No NL-BIOMERO application source file is included in this repository. The
viewer-specific image, configuration, and Nginx snippets were written for this
extension.

### omero-deployment-kit

Source:
[NL-BioImaging/omero-deployment-kit](https://github.com/NL-BioImaging/omero-deployment-kit)

The deployment kit was consulted for its host Nginx and Ansible-oriented OMERO
deployment structure. It informed
[`deployment-omero-deployment-kit.md`](deployment-omero-deployment-kit.md),
including where to add an internal Zarr location and how to mount data
read-only.

No deployment-kit source file was copied. The upstream repository did not
contain an explicit software license when this document was reviewed, so it is
treated strictly as a reference rather than reusable open-source code.

## Work implemented for BIOMERO OME-Zarr Viewer

The following functionality is project-specific work developed in this
repository from the viewer requirements and iterative testing.

### Secure OMERO and BIOMERO backend

- Resolution of a selected OMERO Image through readable Filesets and
  OriginalFiles, with a fallback to `biomero.import` map annotations.
- Translation of recorded BIOMERO source paths into a configured read-only
  deployment mount.
- Canonical path validation and rejection of traversal, encoded traversal,
  symlink escape, ambiguous stores, inaccessible OMERO objects, and unsupported
  metadata.
- Separate normalization of OME-Zarr 0.4/Zarr v2 and OME-Zarr 0.5/Zarr v3
  metadata for images, channels, labels, and HCS plates.
- Capability and error APIs with stable response models and no filesystem-path
  disclosure.
- OME-Zarr-specific signed read claims binding user, active group, image,
  resolved store, operation, token version, and expiry.
- An authenticated `GET`/`HEAD` data gateway that validates every Zarr key and
  delegates byte delivery through `X-Accel-Redirect` without loading chunk
  bodies in Django.
- Bounded, cached server-side rendering for ROI links and multi-image plate or
  well overview panels.

### Viewer and visualization

- An authenticated Zarrita fetch store that adds the signed context header,
  refreshes an expired context once, and retries the request.
- React integration of Viv and deck.gl for OME-NGFF images and multidimensional
  navigation.
- Automatic channel analysis, histogram-aligned contrast ranges, metadata
  defaults, Auto/Fit/Hist controls, additive blending, color, and visibility.
- Middle-slice initialization for Z stacks plus slice, maximum-intensity,
  mean-intensity, and minimum-intensity projection modes.
- 3D volume rendering with quality levels, loading feedback, resource limits,
  and camera state.
- A custom Viv/deck.gl shader extension that derives deterministic colors
  directly from integer label IDs, avoids per-object JavaScript color maps,
  keeps label zero transparent, and supports fill and zoom-aware outlines.
- Independently controlled and reordered label layers with visibility, color,
  opacity, and fill/outline toggles.
- Navigator and physical scale overlays.
- Field, well, and plate overview modes with acquisition/field selection,
  plate-oriented layout, pan and wheel zoom, and drill-down interaction.
- Versioned, validated URL state for reproducible viewer positions and display
  settings without placing the signed storage context in the URL.

### OMERO.web extension and deployment

- An asynchronous Open With capability filter that enables the menu entry only
  for images backed by supported OME-Zarr stores, including plate fields.
- A Vite-to-wheel build pipeline and checks that verify the generated production
  bundle is packaged.
- Plugin lifecycle scripts that preserve co-installed extensions such as
  OMERO.JupyterLite.
- Viewer-specific internal Nginx location snippets for existing NL-BIOMERO and
  omero-deployment-kit deployments.
- Python, frontend, integration, security, wheel-content, and deployment smoke
  tests.

## Licensing and redistribution

BIOMERO OME-Zarr Viewer, including its project-specific code and compatible
adaptations, is distributed under
[AGPL-3.0-or-later](../LICENSE). Copyright and adaptation information is in
[`NOTICE`](../NOTICE). The project license does not replace the licenses of its
dependencies or reference projects. Notices for code included in the compiled
browser bundle are in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

When producing or redistributing a wheel or container:

1. retain this repository's `LICENSE`, `NOTICE`,
   `THIRD_PARTY_NOTICES.md`, and provenance document;
2. retain third-party license notices included by the Python and npm packages;
3. use [`pyproject.toml`](../pyproject.toml),
   [`frontend/package.json`](../frontend/package.json), and
   [`frontend/package-lock.json`](../frontend/package-lock.json) as the
   authoritative dependency inventory; and
4. update this document if code is later copied, vendored, or substantially
   adapted from another source.
