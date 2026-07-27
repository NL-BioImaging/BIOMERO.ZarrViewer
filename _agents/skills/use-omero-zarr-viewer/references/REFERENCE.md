# OMERO ZarrViewer navigation and ROI contract

## Contents

- [Required context](#required-context)
- [Database mapping](#database-mapping)
- [Focused-view inputs](#focused-view-inputs)
- [ROI PNG behavior](#roi-png-behavior)
- [Failure handling](#failure-handling)

## Required context

The host must provide an authenticated active OMERO Image or Plate and
ZarrViewer capabilities for that object. A CI Segmentation measurement
database is portable and deliberately does not store OMERO object IDs.

When both sides provide an identity, require:

```text
measurement_runs.output_store_uuid == viewer store UUID
```

Do not navigate or render when these values differ.

## Database mapping

Schema version 3 provides `object_navigation`. Query one object:

```sql
SELECT object_id, object_type, label_value, timepoint,
       output_store_uuid, output_resource_path,
       output_label_kind, output_label_path, output_channel_index,
       centroid_z_px, centroid_y_px, centroid_x_px,
       bbox_min_y_px, bbox_min_x_px, bbox_max_y_px, bbox_max_x_px,
       size_z, size_y, size_x
FROM object_navigation
WHERE object_id = ?
```

Coordinates and timepoints are zero-based. Bounding-box minima are inclusive;
maxima are exclusive. `output_resource_path` is the HCS field, for example
`A/1/0`.

For the producing image channel:

```sql
SELECT channel_role, channel_index, channel_name, source_step, source_model
FROM label_sources
WHERE label_set_id = ?
ORDER BY source_step, channel_role
```

`channel_index` is one-based. Prefer the `primary` role unless the user asks
for the nucleus input or multiple origins are biologically relevant.

`output_label_kind` determines the overlay input:

- `label-image`: use `output_label_path`;
- `image-channel`: use the one-based `output_channel_index`.

For point-only rows with null bounding boxes, center a default 64×64 pixel ROI
on `centroid_x_px, centroid_y_px`, then clamp each bound to `0..size_x` and
`0..size_y`. State this fallback.

## Focused-view inputs

Supply these semantic inputs through the consumer's authenticated
open-focused-view capability:

| Input | Convention |
| --- | --- |
| active OMERO object | Host-provided Image or Plate ID and group |
| `storeUuid` | Database output UUID |
| `field` | Exact `output_resource_path`, or `.` for a non-plate image |
| `roi` | `x0,y0,x1,y1`, half-open native pixels |
| `sourceChannels` | Comma-separated, one-based channel numbers |
| `labelPath` | Exact path for `label-image` |
| `labelChannel` | One-based output channel for `image-channel` |
| `labelValue` | Positive integer instance value |
| `t`, `z` | Zero-based indices |

Use either `labelPath` or `labelChannel`, never both. A focused view fits the
complete ROI and outlines only `labelValue`.

## ROI PNG behavior

The authenticated renderer returns a native-resolution 8-bit RGB PNG. It uses
OME display windows/colors for additive intensity composition and outlines the
selected label in its display color or yellow.

Default server limits are:

- width: 2048 pixels;
- height: 2048 pixels;
- intensity channels: 4;
- encoded response: 16 MiB.

Request fewer channels or a smaller crop when a limit is exceeded. Do not
silently rescale the requested native-pixel ROI.

## Failure handling

- Missing active OMERO context: ask the user to select the output Image or
  Plate.
- UUID mismatch: stop and explain that the database belongs to another output.
- Missing schema-v3 navigation fields: inspect older tables and explain that
  automatic navigation may be incomplete.
- Unknown field, label, channel, Z/T plane, or out-of-bounds ROI: report the
  invalid value and query valid metadata before retrying.
- Permission failure: preserve the active group and ask the user to obtain
  access; never work around OMERO authorization.
- Renderer limit: reduce bounds/channels with the user's intent preserved.
