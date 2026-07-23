# Deploy with `omero-deployment-kit`

[`NL-BioImaging/omero-deployment-kit`](https://github.com/NL-BioImaging/omero-deployment-kit)
already installs Nginx on the host and proxies OMERO.web from
`127.0.0.1:4080`. The viewer uses that Nginx service; do not add an Nginx
container.

The examples below assume that both repositories have been checked out on the
Ansible controller:

```text
work/
├── BIOMERO.ZarrViewer/
└── omero-deployment-kit/
```

## 1. Build and copy the viewer wheel

From `BIOMERO.ZarrViewer`:

```bash
python -m pip install build
python scripts/build_frontend.py
python -m build --wheel
python scripts/verify_wheel.py dist/<wheel-file>.whl
```

Create the deployment role's files directory and copy the wheel:

```bash
mkdir -p ../omero-deployment-kit/roles/docker/files
cp dist/<wheel-file>.whl \
  ../omero-deployment-kit/roles/docker/files/
```

Pin and commit the exact wheel used by the institutional deployment branch, or
replace this step with an equivalent pinned artifact download.

## 2. Add the deployment variables

Add these values to the applicable host in `hosts.yml`:

```yaml
biomero_zarr_wheel: "<wheel-file>.whl"

# Prefix stored in OriginalFile paths or biomero.import Filepath values.
biomero_zarr_source_root: "/data"

# The same storage root inside the OMERO.web container.
biomero_zarr_web_mount_root: "/data"

# The same storage root in the host filesystem, where host Nginx can read it.
biomero_zarr_nginx_root: "/srv/biomero/inplace"
```

`biomero_zarr_source_root` may differ from the two physical mount paths. The
suffix below all roots must identify the same file. For example:

```text
recorded:  /data/project/example.ome.zarr
OMERO.web: /data/project/example.ome.zarr
Nginx:     /srv/biomero/inplace/project/example.ome.zarr
```

## 3. Copy the wheel into the remote Docker build context

In `roles/docker/tasks/main.yml`, after the task that creates the remote
`docker` directory, add:

```yaml
- name: Copy BIOMERO Zarr Viewer wheel
  copy:
    src: "{{ biomero_zarr_wheel }}"
    dest: "{{ ansible_user_dir }}/omero-deployment-kit/docker/{{ biomero_zarr_wheel }}"
    mode: "0644"
  notify: restart omero containers
```

## 4. Install and configure the OMERO.web app

Add
[`deploy/omero-deployment-kit/Dockerfile-web.fragment`](../deploy/omero-deployment-kit/Dockerfile-web.fragment)
after `FROM` and before `omero web syncmedia` in
`roles/docker/templates/Dockerfile-web.j2`.

Append
[`deploy/omero-deployment-kit/web-config.omero.j2`](../deploy/omero-deployment-kit/web-config.omero.j2)
to `roles/docker/templates/web_conf.omero.j2`.

Mount the store read-only into the `omeroweb` service in
`roles/docker/templates/docker-compose.yml.j2`:

```yaml
services:
  omeroweb:
    volumes:
      - "{{ biomero_zarr_nginx_root }}:{{ biomero_zarr_web_mount_root }}:ro"
```

Keep the existing web configuration and static volume entries.

## 5. Extend the existing host Nginx

Insert
[`deploy/omero-deployment-kit/nginx-location.conf.j2`](../deploy/omero-deployment-kit/nginx-location.conf.j2)
inside the HTTPS `server` block in
`roles/base/templates/omero.conf.j2`.

This location is `internal`, so clients cannot bypass the viewer's OMERO
permission and signed-context checks. The alias uses the host path because
Nginx runs outside the OMERO.web container.

Ensure the Nginx worker can traverse and read
`biomero_zarr_nginx_root`. Do not grant it write access.

## 6. Deploy and verify

Run the deployment normally:

```bash
cd ../omero-deployment-kit
ansible-playbook playbook.yml
```

Then:

1. Sign in through the HTTPS Nginx endpoint.
2. Select a BIOMERO-backed Image or Plate.
3. Open **Open With → OME-Zarr Viewer**.
4. Confirm `/biomero_zarr_viewer/data/images/...` requests return 200 or 206.
5. Confirm a direct request below `/_biomero_zarr_internal/` returns 404.

If capabilities work but chunks report **Failed to fetch**, compare the same
relative store path below `biomero_zarr_web_mount_root` and
`biomero_zarr_nginx_root`, and inspect the host Nginx error log.
