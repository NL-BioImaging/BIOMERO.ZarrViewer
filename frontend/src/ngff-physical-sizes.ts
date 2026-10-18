interface NgffAxis {
  name?: unknown;
  unit?: unknown;
}
import { calibratedAxes } from "./calibration";

interface NgffTransform {
  type?: unknown;
  scale?: unknown;
}

interface NgffDataset {
  coordinateTransformations?: unknown;
}

interface NgffMultiscale {
  axes?: unknown;
  datasets?: unknown;
  coordinateTransformations?: unknown;
}

export interface PhysicalSize {
  size: number;
  unit: string;
}

const MICROMETERS_PER_UNIT: Record<string, number> = {
  meter: 1_000_000,
  metre: 1_000_000,
  centimeter: 10_000,
  centimetre: 10_000,
  millimeter: 1_000,
  millimetre: 1_000,
  micrometer: 1,
  micrometre: 1,
  um: 1,
  "µm": 1,
  nanometer: 0.001,
  nanometre: 0.001,
  nm: 0.001,
  picometer: 0.000001,
  picometre: 0.000001,
  pm: 0.000001,
};

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function rootMetadata(metadata: unknown): Record<string, unknown> | undefined {
  const root = objectValue(metadata);
  return objectValue(root?.ome) || root;
}

function axesFrom(multiscale: NgffMultiscale): NgffAxis[] {
  if (!Array.isArray(multiscale.axes)) return [];
  return multiscale.axes.map((axis) => typeof axis === "string" ? { name: axis } : (objectValue(axis) || {}));
}

function transformsFrom(value: unknown): NgffTransform[] {
  return Array.isArray(value)
    ? value.map((transform) => objectValue(transform) || {})
    : [];
}

function datasetScale(multiscale: NgffMultiscale, axisCount: number, level: number): number[] | undefined {
  const datasets = Array.isArray(multiscale.datasets) ? multiscale.datasets : [];
  const dataset = objectValue(datasets[level]) as NgffDataset | undefined;
  if (!dataset) return undefined;
  const transforms = [
    ...transformsFrom(multiscale.coordinateTransformations),
    ...transformsFrom(dataset.coordinateTransformations),
  ];
  const scale = Array(axisCount).fill(1);
  let found = false;
  for (const transform of transforms) {
    if (transform.type !== "scale" || !Array.isArray(transform.scale) || transform.scale.length !== axisCount) continue;
    const values = transform.scale.map(Number);
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) continue;
    values.forEach((value, index) => { scale[index] *= value; });
    found = true;
  }
  return found ? scale : undefined;
}

/**
 * Extract physical voxel sizes for an NGFF dataset, defaulting to level zero.
 */
export function ngffPhysicalSizes(metadata: unknown, level = 0): Record<string, PhysicalSize> | undefined {
  const root = rootMetadata(metadata);
  const multiscales = root?.multiscales;
  if (!Array.isArray(multiscales) || !multiscales.length) return undefined;
  const multiscale = objectValue(multiscales[0]) as NgffMultiscale | undefined;
  if (!multiscale) return undefined;
  const axes = axesFrom(multiscale);
  const scale = datasetScale(multiscale, axes.length, level);
  if (!scale) return undefined;

  const values = ["x", "y", "z"].flatMap((name) => {
    const index = axes.findIndex((axis) => axis.name === name);
    if (index < 0) return [];
    return [{
      name,
      size: scale[index],
      unit: typeof axes[index].unit === "string" ? axes[index].unit.trim().toLowerCase() : "",
    }];
  });
  if (!values.length) return undefined;

  const units = new Set(values.map(({ unit }) => unit).filter(Boolean));
  const canNormalize = values.every(({ unit }) => !unit || MICROMETERS_PER_UNIT[unit] != null);
  if (units.size > 1 && !canNormalize) return undefined;

  return Object.fromEntries(values.map(({ name, size, unit }) => {
    if (canNormalize && unit) {
      return [name, { size: size * MICROMETERS_PER_UNIT[unit], unit: "micrometer" }];
    }
    return [name, { size, unit: unit || "pixel" }];
  }));
}

export function attachNgffPhysicalSizes(loader: any[], metadata: unknown): any[] {
  const physicalSizes = ngffPhysicalSizes(metadata);
  if (!physicalSizes) return loader;
  for (const [level, source] of loader.entries()) {
    const levelSizes = ngffPhysicalSizes(metadata, level);
    const root=rootMetadata(metadata), multiscale=(root?.multiscales as any[])?.[0];
    const axes=(multiscale?.axes || []).map((a:any)=>typeof a==="string"?{name:a}:a);
    const calibration=calibratedAxes(axes,[...(multiscale?.datasets?.[0]?.coordinateTransformations||[]),...(multiscale?.coordinateTransformations||[])]);
    const levelCalibration=calibratedAxes(axes,[...(multiscale?.datasets?.[level]?.coordinateTransformations||[]),...(multiscale?.coordinateTransformations||[])]);
    source.meta = {
      ...(source.meta || {}),
      physicalOrigin:Object.fromEntries(Object.entries(calibration).map(([axis,value])=>[axis,value.origin])),
      volumeTranslation:Object.fromEntries(["x","y","z"].map(axis=>[axis,((levelCalibration[axis]?.origin||0)-(calibration[axis]?.origin||0))/(physicalSizes[axis]?.size||1)])),
      // Keep Viv's base-pixel coordinate system for 2D and camera state. The
      // standalone 3D level uses these axis-specific ratios as its model matrix.
      volumeScale: Object.fromEntries(["x", "y", "z"].flatMap((axis) => {
        const base = physicalSizes[axis];
        const selected = levelSizes?.[axis];
        return base && selected ? [[axis, selected.size / base.size]] : [];
      })),
      physicalSizes: {
        ...(source.meta?.physicalSizes || {}),
        ...physicalSizes,
      },
    };
  }
  return loader;
}
