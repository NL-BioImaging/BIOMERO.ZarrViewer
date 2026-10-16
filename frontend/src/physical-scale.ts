export function scaleBarSize(pixelSize: number, zoom: number): { value: number; pixels: number } {
  const unitsPerScreenPixel = pixelSize / Math.pow(2, zoom);
  const target = unitsPerScreenPixel * 110;
  const power = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / power;
  const nice = (normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10) * power;
  return { value: Number(nice.toPrecision(12)), pixels: nice / unitsPerScreenPixel };
}

export function unitLabel(unit: string): string {
  return unit === "micrometer" || unit === "micrometre" || unit === "µm" ? "µm" : unit;
}
