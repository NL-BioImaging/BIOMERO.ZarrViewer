export interface Axis {
  name: string;
  type?: string;
  unit?: string;
}

export interface ChannelCapability {
  index: number;
  label: string;
  active: boolean;
  color?: string;
  window?: { min: number; max: number; start: number; end: number };
}

export interface DatasetCapability {
  path: string;
  coordinate_transformations?: unknown[];
}

export interface LabelCapability {
  id: string;
  name: string;
  path: string;
  axes: Axis[];
  datasets: DatasetCapability[];
  color?: string;
  opacity?: number;
}

export interface PlateField {
  path: string;
  name: string;
  acquisition?: number;
}

export interface PlateWell {
  path: string;
  row_index: number;
  column_index: number;
  fields: PlateField[];
}

export interface PlateCapability {
  name: string;
  rows: string[];
  columns: string[];
  acquisitions: Array<{ id: number; name?: string }>;
  wells: PlateWell[];
  initial_path: string;
}

export interface Capability {
  schema_version: 1;
  supported: true;
  image: { id: number; name: string };
  store: { url: string; context: string; expires_at: string };
  kind: "image" | "plate";
  ngff_version: "0.4" | "0.5";
  zarr_format: 2 | 3;
  initial_path: string;
  axes: Axis[];
  datasets?: DatasetCapability[];
  channels: ChannelCapability[];
  labels: LabelCapability[];
  plate?: PlateCapability;
}

export interface ApiFailure {
  supported: false;
  error: { code: string; message: string };
}

export interface ChannelState {
  index: number;
  label: string;
  visible: boolean;
  color: string;
  low: number;
  high: number;
  domainMin: number;
  domainMax: number;
}

export type LabelMode = "fill" | "outline";
export type ProjectionMode = "slice" | "mip" | "mean" | "min";
export type RenderMode = "2d" | "3d";

export interface LabelState {
  id: string;
  name: string;
  path: string;
  visible: boolean;
  opacity: number;
  mode: LabelMode;
  color?: string;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface VolumeCameraState {
  orbit: number;
  tilt: number;
  zoom: number;
}

export interface VolumeLevel {
  index: number;
  width: number;
  height: number;
  depth: number;
  rawBytes: number;
  safe: boolean;
  reason?: "memory" | "texture" | "not-3d";
}

declare global {
  interface Window {
    BIOMERO_ZARR_VIEWER: { capabilitiesTemplate: string };
  }
}
