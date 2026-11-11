---
name: biomero-zarrviewer-dev
description: Development runbook for BIOMERO.ZarrViewer, the OMERO.web OME-Zarr viewer plugin (Django backend plus Vite/React and Neuroglancer frontend). Use when changing the Python package, the frontend, the bundled analysis skill, Docker or deployment recipes, or documentation, and when drafting stable or beta release notes.
---

# BIOMERO.ZarrViewer Development

Read the shared NL-BIOMERO rules first and follow them; they cover principles,
branches and pull requests, agent guidance and local checkouts:
<https://github.com/NL-BioImaging/NL-BIOMERO/blob/master/.agents/skills/nl-biomero-engineering/SKILL.md>

Work from the repository root, the directory containing `.agents`.

## Purpose and boundaries

- Read-only OME-Zarr viewer (2D, Neuroglancer and Viv 3D, HCS plates, labels,
  movies) installed as an OMERO.web app (`biomero_zarr_viewer`). OMERO
  permissions apply; the viewer never writes to OMERO.
- Works with standalone OMERO and with NL-BIOMERO deployments. BIOMERO, Slurm and
  OMERO.Analysis are not required.
- Reads physical OME-Zarr 0.4/0.5 stores registered through standard OMERO
  `ExternalInfo`, and reconstructs BIOMERO shallow results (BIOMERO.shallower) as
  one logical store; see `docs/data-and-registration.md`. These registrations
  keep precedence over the optional HTTP provider.
- The optional `omero-web-zarr` provider serves ordinary OMERO images as virtual
  OME-Zarr; it is disabled by default and not a required dependency
  (`docs/http-zarr.md`).
- OMERO.biomero and NL-BIOMERO consume the viewer through deployment recipes
  (`deploy/`, `docs/deployment-nl-biomero.md`) and the analysis skill.

## Layout

- `src/biomero_zarr_viewer/`: Django app (views, URLs, resolver, Neuroglancer
  contexts, caches, tokens, settings) and the packaged browser assets and
  `analysis_skills/`.
- `frontend/`: Vite/React viewer (`src/`) and Neuroglancer entry (`neuroglancer/`).
- `tests/`: pytest backend tests. Frontend tests sit beside their sources.
- `docker/`, `deploy/`: image recipes, Nginx routes, deployment fragments.
- `docs/`: MkDocs site (`mkdocs.yml`). `docs/viewer-guide.md` is also the bundled
  in-app help: keep it to viewer features.
- `scripts/`: frontend build, wheel verification, smoke tests, skill sync.

## Build and test

Commands are from `docs/development.md` and `.github/workflows/validate.yml`.

- Backend: `python -m pip install -e ".[test]"` then `python -m pytest`.
- Frontend, from `frontend/`: `npm ci`, `npm test`, `npm run typecheck`,
  `npm run build`; `npm audit --audit-level=moderate` must pass.
- Browser smoke tests (need Chrome): `npm run smoke:sections`, `npm run smoke:movie`.
- Docs: `pip install -r docs/requirements.txt` then `mkdocs build --strict`.
- Wheel: `python scripts/build_frontend.py --skip-install`,
  `python -m build --wheel`, `python scripts/verify_wheel.py dist/<wheel>.whl`.
- Dependency overrides and the lockfile are reviewed source changes, not audit
  suppressions; keep the third-party notices in sync when the bundle changes.

## User-facing analysis skill

`_agents/skills/use-omero-zarr-viewer/` is not development guidance. It is the
canonical source of the skill the wheel ships to OMERO.Analysis consumers, and it
stays in that location. After editing it, run
`python scripts/sync_analysis_skills.py` to refresh the packaged copy in
`src/biomero_zarr_viewer/analysis_skills/`; `--check` (run by the frontend build)
fails when they differ. See `docs/api.md` and `docs/movies.md`.

## Documentation

Put each topic in its guide: usage in `docs/viewer-guide.md`, install and
configuration in the administrator guides, API in `docs/api.md`. Version-specific
changes belong in release notes, not in general guides. The README uses absolute
links so it renders on GitHub and PyPI.

## Release notes

Python versions come from Git tags (setuptools-scm); a branch update is not a
release. Tags and publishing need explicit authorization. Before drafting a
stable or beta release body, read
[references/release-notes.md](references/release-notes.md).
