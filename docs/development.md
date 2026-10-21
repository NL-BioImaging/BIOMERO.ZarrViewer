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

With Chrome installed, `npm run smoke:sections` verifies actual Neuroglancer
section pixels and volume clipping using a tiny synthetic uint16 volume. It
covers the native Zarr and decoded-chunk transports, checking XY, XZ and YZ
individually. The combined Orthogonal layout is checked in the live matrix;
four-panel ray casting can stall CPU-only CI renderers. This test uses no
public datasets or OMERO instance. CI runs it
alongside `npm run smoke:movie` and saves screenshots in `frontend/test-results`.

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

## Frontend dependency security

Use `npm ci` to reproduce `frontend/package-lock.json`, then run
`npm audit --audit-level=moderate`. CI fails for moderate or higher advisories;
it does not ignore the `sprintf-js` advisory or downgrade Viv to satisfy audit.
Viv 0.23.0 and the direct Deck.gl packages are pinned together on Deck.gl 9.4.0.
Vite is pinned at 7.3.7, which includes the launch-editor security patches.

The scoped `@loaders.gl/textures` override replaces its unused Node-only
`texture-compressor` CLI dependency with the empty `dry-uninstall` package,
following the existing browser-only dependency exclusions for Ikonate. The
viewer does not run this experimental Node texture writer; GPU texture reading,
image/Zarr decoding and MP4 encoding retain their real implementations.
Removing that CLI also removes its `argparse`/`sprintf-js` dependency chain.
There is no patched upstream `sprintf-js` release for
[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).

The version-scoped `fflate` override upgrades only the affected 0.7.0–0.7.4
range to 0.7.5; it leaves newer 0.8.x consumers intact. If an existing npm tree
retains an old overridden entry, `npm update fflate` refreshes the lockfile;
confirm the result with a clean `npm ci` and a fresh audit. Overrides and the
lockfile are reviewed source changes, not audit suppressions. Keep the generated
third-party license inventory in sync when rebuilding the browser bundle.
