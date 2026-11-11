# BIOMERO.ZarrViewer

Read-only OME-Zarr viewer for OMERO.web: multichannel images, Z stacks, time
series, HCS plates, labels, 3D (Neuroglancer, Viv) and movie export. Installs as
the `biomero_zarr_viewer` OMERO.web app; works standalone or inside NL-BIOMERO.

## Read first

1. Shared rules for all component repositories:
   <https://github.com/NL-BioImaging/NL-BIOMERO/blob/master/.agents/skills/nl-biomero-engineering/SKILL.md>
2. Independent PR review procedure:
   <https://github.com/NL-BioImaging/NL-BIOMERO/blob/master/.agents/skills/nl-biomero-review/SKILL.md>
3. Development runbook, boundaries and release notes:
   [`.agents/skills/biomero-zarrviewer-dev/SKILL.md`](.agents/skills/biomero-zarrviewer-dev/SKILL.md)

`_agents/skills/use-omero-zarr-viewer/` is the user-facing skill shipped with the
wheel for OMERO.Analysis consumers. Keep it in place; it is not development
guidance.

## Layout

- `src/biomero_zarr_viewer/`: Django app, packaged browser assets, `analysis_skills/`.
- `frontend/`: Vite/React viewer and Neuroglancer entry.
- `tests/`: backend tests. `docs/`: MkDocs site. `docker/`, `deploy/`: images and routes.

## Build and check

- Backend: `python -m pip install -e ".[test]"`, `python -m pytest`.
- Frontend (in `frontend/`): `npm ci`, `npm test`, `npm run typecheck`, `npm run build`.
- Docs: `mkdocs build --strict`.
- CI: `.github/workflows/validate.yml` runs all of the above plus smoke tests and wheel checks.

## Related repositories

NL-BIOMERO, OMERO.biomero, BIOMERO.shallower, biomero, biomero-scripts,
BIOMERO.importer, biomero-schema, all under <https://github.com/NL-BioImaging>.
Each has its own `AGENTS.md`.
