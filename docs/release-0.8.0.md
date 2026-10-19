# Release 0.8.0 readiness

This document records the candidate on `0.8.0-beta1`; it does not publish a release.

## Changes included

- 2D image and plate navigation, numeric field ordering and compact overview grids.
- Neuroglancer and Viv Volume, Slice and Orthogonal views with linked physical navigation, scale bars, a 200 MiB view-level limit and native streaming where supported.
- Automatic contrast on fresh openings, exact saved/manual contrast restoration, bounded sampling/caches and cancellation.
- Label opacity defaults of 15% for single-Z images and 55% for Z stacks; channel color presets and stable label colors in exports.
- Metadata summaries and on-demand hierarchy browsing, readable OMERO annotations and wrapping metadata tables.
- 2D and rendered 3D MP4 export, sequential frame loading, cancellation and provenance.
- Image interaction cursors, calibrated Fit/native-pixel 1:1 toolbar buttons and fixed 3D background. The obsolete background picker, state and URL handling are removed.

## Validation

Checked locally on 19 October 2026:

- Frontend: **199 tests passed in 41 files**; TypeScript and both production renderer builds passed.
- Backend: **166 passed, five expected platform/optional-format skips**.
- Strict MkDocs build passed. The searchable in-app Help contains the new toolbar, cursor and movie instructions.
- A local candidate wheel and source distribution with version **0.8.0** built successfully (using a build-only version override, without a release tag). Installed-wheel asset/hash verification and `twine check` passed for both distributions.
- Docker/Chrome: image **539** (2D opening, native-pixel zoom and Fit), image **14006** (both engines, Volume/Slice/Orthogonal, linked scales, Fit and 1:1), and plate **1124** (well overview, 36 numerically ordered fields). No background color control remains. A browser-discovered Neuroglancer camera-command issue was fixed and given an application regression test.
- Dependency audit: **zero high/critical findings**. There are **13 moderate entries** in Viv's transitive loaders/texture-compressor chain, rooted in the `sprintf-js` unbounded-precision advisory. The automated suggested change would downgrade Viv to 0.16.1; that is not a compatible release fix. This remains a dependency follow-up rather than a clean-audit claim.

Historical source-data and movie evidence is retained in [public-data validation](publicdata-validation-2026-10-18.md). Historical benchmark documents describe their measured commits and may show controls/defaults that have since changed.

## Publishing audit

- PyPI's latest published package is 0.7.1; version 0.8.0 was unused when checked on 19 October 2026.
- The last v0.7.1 GitHub release publication succeeded. The repository has the `pypi` environment; `release.yml` uses OIDC Trusted Publishing with job-scoped `id-token: write` and no API token in the repository. PyPI’s public provenance for the 0.7.1 wheel confirms this repository, `release.yml` and the `pypi` environment as its Trusted Publisher.
- A stable tag must be **v0.8.0**, matching setuptools-scm's derived version. Version validation occurs before building/uploading distributions.
- CI checks Python 3.10/3.12, TypeScript, frontend tests/build, the high-severity dependency audit, Chrome movie smoke tests, strict documentation and installed-wheel assets.
- All Actions, including the Pages actions, are pinned to reviewed commit SHAs. The release build includes the mesh runtime dependencies needed by its backend tests and checks wheel version/assets and package metadata before publishing.
- Frontend version metadata is 0.8.0; the obsolete Alpha package classifier is now Beta, reflecting the tested candidate. The README logo markup is valid and its logo/documentation links are absolute for PyPI.
- GitHub Pages is restricted to `main`. The reviewed candidate and updated documentation must reach the default branch before stable publication so the published help and README links describe 0.8.0.

## Publication steps

1. Review the candidate and its passing checks; update `main` to the approved release source.
2. Confirm Pages has published the matching documentation.
3. Create **v0.8.0** on that reviewed commit and publish its GitHub release when authorized.
4. Confirm `release.yml` succeeds, PyPI contains wheel and source distribution at 0.8.0, and verify a clean install.

No stable tag, GitHub release or registry publication is created by this readiness work. Private PyPI account settings are not changed. Successful future publishing can only be confirmed by the authorized release run.
