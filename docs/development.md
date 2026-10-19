# Development

Install and run the backend tests:

```bash
python -m pip install -e ".[test]"
python -m pytest
```

Run the frontend checks:

```bash
cd frontend
npm ci
npm test
npm run typecheck
npm run build
```

Build and validate a release wheel:

```bash
python scripts/build_frontend.py --skip-install
python -m build --wheel
python scripts/verify_wheel.py dist/<wheel-file>.whl
```

Before a release, run the live compatibility matrix in
[`docs/compatibility-spike.md`](compatibility-spike.md). An authenticated
deployment can be checked with:

```powershell
.\scripts\smoke-test.ps1 `
  -BaseUrl https://omero.example.org `
  -ImageId 123 `
  -Cookie "sessionid=..."
```

The bundled help is built from `docs/viewer-guide.md`. Keep that guide focused on
viewer features; installation and API instructions belong in the other guides.

The `0.8.0-beta1` branch collects the 3D viewer changes. Python package versions
come from Git tags through setuptools-scm; a branch update is not a published release.

## Preparing 0.8.0

Run backend and frontend tests, the strict documentation build, browser acceptance and distribution checks. The reusable CI workflow includes all of these; the release workflow validates the same source before publishing. See [release readiness](release-0.8.0.md) for this candidate's evidence and the remaining publication steps.

`frontend/package.json` is private and identifies this frontend as 0.8.0; the published Python version still comes exclusively from the Git tag. Use **v0.8.0** for the stable release. A locally built wheel with a 0.8.0 version override is a validation artifact, not a published release. Do not create a tag or publish merely to test the workflow.

The README uses an absolute logo URL and absolute repository documentation links so they work on both GitHub and PyPI. Before publishing, update the default branch to the reviewed release candidate: GitHub Pages currently publishes documentation from `main`.
