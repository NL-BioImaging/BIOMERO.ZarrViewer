"""Generate packaged skill resources from the canonical authoring directory."""
import argparse
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
source = root / '_agents/skills/use-omero-zarr-viewer'
target = root / 'src/biomero_zarr_viewer/analysis_skills/use-omero-zarr-viewer'
for item in source.rglob('*'):
    if not item.is_file():
        continue
    destination = target / item.relative_to(source)
    if args.check:
        if not destination.is_file() or destination.read_bytes() != item.read_bytes():
            raise SystemExit(f'Packaged skill differs: {destination}; run scripts/sync_analysis_skills.py')
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(item, destination)
print('Packaged skills match the canonical authoring resources')
