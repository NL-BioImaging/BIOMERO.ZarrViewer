"""Authenticated HTTP timings; cold means derived application cache, not OS cache."""
import argparse
import json
import os
from pathlib import Path
import re
import time
from urllib.parse import urljoin

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'omeroweb.settings')
import django
django.setup()
from django.core import signing
import requests
from biomero_zarr_viewer import volume_cache as cache
from biomero_zarr_viewer.tokens import TOKEN_SALT

p = argparse.ArgumentParser()
p.add_argument('--output', required=True)
p.add_argument('--runs', type=int, default=3)
p.add_argument('--cases', required=True, help='JSON list of explicit image/level/channel/label selections')
p.add_argument('--group-id', required=True, type=int)
p.add_argument('--base-url', default='http://localhost:4080')
p.add_argument('--username', default='root')
p.add_argument('--password-env', default='ROOTPASS')
p.add_argument('--cold', action='store_true', help='Reset only derived cache entries for the selected user/group/images')
a = p.parse_args()
assert 1 <= a.runs <= 50, "runs must be between 1 and 50"
base = a.base_url.rstrip("/")
s = requests.Session()
s.trust_env = False
for attempt in range(90):
    r = s.get(base + '/webclient/login/', timeout=30)
    csrf = re.search(r'name=[\"\']csrfmiddlewaretoken[\"\']\s+value=[\"\']([^\"\']+)', r.text)
    if csrf:
        break
    time.sleep(1)
assert csrf, ('Login unavailable',r.status_code,r.text[:100])
csrf = csrf.group(1)
r = s.post(r.url, data={'csrfmiddlewaretoken': csrf, 'server': '1', 'username': a.username, 'password': os.environ[a.password_env]}, headers={'Referer': r.url}, timeout=60)
assert '/login/' not in r.url
s.get(base + '/webclient/active_group/', params={'active_group': a.group_id}, timeout=30)
cases = json.loads(Path(a.cases).read_text())
records = json.loads(Path(a.output).read_text())['records'] if Path(a.output).exists() else []

def get(url, **kw):
    r = s.get(urljoin(base, url), timeout=180, **kw)
    assert r.status_code == 200, (r.status_code, r.text[:400], url)
    return r

for case in cases:
    name, level, image = case['name'], case['level'], case['image_id']
    cap = get(f'/biomero_zarr_viewer/api/images/{image}/capabilities/', params={'omero_group': a.group_id}).json()
    store = cap['store']
    headers = {'X-OMERO-Zarr-Context': store['context']}
    claims = signing.loads(store['context'], salt=TOKEN_SALT)
    scope = cache.scope_key(claims, image)
    params = {'field': case.get('field', '.'), 'level': level, 't': case.get('t', 0),
              'channels': json.dumps(case.get('channels', [0])), 'labels': json.dumps(case.get('labels', []))}
    for run in range(a.runs):
        # Only the selected authenticated scope is cleared, after jobs finish.
        if a.cold:
            with cache.database() as db:
                rows = db.execute('SELECT key,status FROM entries WHERE scope=?', (scope,)).fetchall()
                assert all(row['status'] not in ('queued', 'building') for row in rows), 'fixture jobs still running'
                for row in rows:
                    assert re.fullmatch('[0-9a-f]{64}',row['key'])
                    (cache.cache_root() / (row['key'] + '.bin')).unlink(missing_ok=True)
                db.execute('DELETE FROM entries WHERE scope=?', (scope,))
        for state in (['cold', 'cached'] if a.cold else ['cached']):
            start = time.perf_counter()
            deadline = start + 180
            calls = 0
            while True:
                assert time.perf_counter() < deadline, "Preparation timed out"
                result = get(store['neuroglancer_url'], params=params, headers=headers).json()
                calls += 1
                if result['status'] == 'ready':
                    break
                time.sleep(.05)
            ready = time.perf_counter()
            url = result['url']
            source_name = 'image-' + str(case.get('channels',[0])[0])
            first = result['sources'][source_name]
            # Stable precomputed adapter used to compare identical decoded bytes.
            z,y,x = first['shape']
            bounds = [f'{max(0, n//2-32)}-{min(n, max(0, n//2-32)+64)}' for n in [x,y,z]]
            chunk_start = time.perf_counter()
            chunk = get(url + source_name + '/0/' + '_'.join(bounds))
            first_chunk = time.perf_counter()
            # New implementation can display intensities while label jobs run.
            while result.get('pending'):
                assert time.perf_counter() < deadline, 'Background mesh preparation timed out'
                time.sleep(.05)
                result = get(store['neuroglancer_url'], params=params, headers=headers).json()
                calls += 1
            labels_ready = time.perf_counter()
            ids = result['sources'].get('label-0',{}).get('segments', [])[:3]
            mesh_start = time.perf_counter()
            sizes = []
            mesh_errors = []
            for segment in ids:
                response = s.get(urljoin(base, url + f'label-0/mesh/{segment}'), timeout=180)
                sizes.append(len(response.content) if response.status_code == 200 else None)
                if response.status_code != 200:
                    mesh_errors.append({'segment': segment, 'status': response.status_code, 'body': response.text[:300]})
            end = time.perf_counter()
            with cache.database() as db:
                disk = db.execute('SELECT COALESCE(SUM(size),0) FROM entries WHERE scope=?', (scope,)).fetchone()[0]
            record = {'name': name, 'image_id': image, 'level': level, 'run': run+1, 'state': state,
                      'shape_zyx': first['shape'], 'transport': first.get('transport', 'packed'),
                      'prepare_s': round(ready-start,4), 'first_chunk_s': round(first_chunk-chunk_start,4),
                      'first_data_s': round(first_chunk-start,4), 'labels_ready_s': round(labels_ready-start,4),
                      'mesh_fetch_s': round(end-mesh_start,4), 'total_s': round(end-start,4),
                      'chunk_bytes': len(chunk.content), 'mesh_bytes': sizes, 'mesh_errors': mesh_errors or result['sources'].get('label-0',{}).get('mesh_errors', {}), 'cache_bytes': disk, 'prepare_requests': calls}
            records.append(record)
            Path(a.output).write_text(json.dumps({'cache_definition': 'Cold derived cache only; OS filesystem cache is not flushed.',
                'base': base, 'records': records}, indent=2))
            print(json.dumps(record), flush=True)
