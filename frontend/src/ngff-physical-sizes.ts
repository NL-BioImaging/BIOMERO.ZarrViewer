interface NgffAxis {
  name?: unknown;
  unit?: unknown;
}

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

function baseScale(multiscale: NgffMultiscale, axisCount: number): number[] | undefined {
  const datasets = Array.isArray(multiscale.datasets) ? multiscale.datasets : [];
  const firstDataset = objectValue(datasets[0]) as NgffDataset | undefined;
  const transforms = [
    ...transformsFrom(multiscale.coordinateTransformations),
    ...transformsFrom(firstDataset?.coordinateTransformations),
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
 * Extract the highest-resolution physical voxel sizes from NGFF coordinate
 * transformations. Viv applies its own resolution matrix for lower pyramid
 * levels, so every PixelSource must receive these same base sizes.
 */
export function ngffPhysicalSizes(metadata: unknown): Record<string, PhysicalSize> | undefined {
  const root = rootMetadata(metadata);
  const multiscales = root?.multiscales;
  if (!Array.isArray(multiscales) || !multiscales.length) return undefined;
  const multiscale = objectValue(multiscales[0]) as NgffMultiscale | undefined;
  if (!multiscale) return undefined;
  const axes = axesFrom(multiscale);
  const scale = baseScale(multiscale, axes.length);
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
  for (const source of loader) {
    source.meta = {
      ...(source.meta || {}),
      physicalSizes: {
        ...(source.meta?.physicalSizes || {}),
        ...physicalSizes,
      },
    };
  }
  return loader;
}
