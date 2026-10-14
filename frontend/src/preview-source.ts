import * as zarr from "zarrita";

/** Open only the array needed for a preview, rather than every pyramid level. */
export async function loadPreviewPyramid(store: any): Promise<any[]> {
  const location = zarr.root(store);
  const group = await zarr.open(location, { kind: "group" });
  const attributes: any = group.attrs;
  const metadata = attributes.ome || attributes;
  const multiscale = metadata.multiscales?.[0];
  if (!multiscale?.datasets?.length) throw new Error("Image has no multiscale datasets");
  const labels: string[] = (multiscale.axes || ["t", "c", "z", "y", "x"]).map((axis: any) => typeof axis === "string" ? axis : axis.name);
  const datasets: any[] = multiscale.datasets;
  const first = await zarr.open(location.resolve(datasets[0].path), { kind: "array" });
  const scale = (dataset: any, axis: number, fallback: number) => {
    const transforms = (dataset.coordinateTransformations || []).filter((item: any) => item.type === "scale");
    if (!transforms.length) return fallback;
    return transforms.reduce((product: number, item: any) => product * Number(item.scale?.[axis] ?? 1), 1);
  };
  return datasets.map((dataset, level) => {
    let array = level === 0 ? Promise.resolve(first) : undefined;
    const source = {
      labels,
      shape: first.shape.map((size, axis) => {
        if (!["x", "y"].includes(labels[axis])) return size;
        const ratio = scale(dataset, axis, 2 ** level) / scale(datasets[0], axis, 1);
        return Math.max(1, Math.round(size / (Number.isFinite(ratio) && ratio > 0 ? ratio : 2 ** level)));
      }),
      async getRaster(options: any) {
        array ||= zarr.open(location.resolve(dataset.path), { kind: "array" });
        try {
          const opened = await array;
          source.shape = opened.shape;
          if (opened.shape[labels.indexOf("x")] * opened.shape[labels.indexOf("y")] > 4_194_304) {
            throw new Error("No bounded pyramid level is available for this preview; open the field to inspect it");
          }
          const selection = labels.map((axis) => axis === "x" || axis === "y" ? null : Number(options.selection?.[axis] || 0));
          const raster: any = await zarr.get(opened, selection);
          return { data: raster.data, width: opened.shape[labels.indexOf("x")], height: opened.shape[labels.indexOf("y")] };
        } catch (reason) {
          array = undefined;
          throw reason;
        }
      },
    };
    return source;
  });
}
