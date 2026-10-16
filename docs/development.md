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
