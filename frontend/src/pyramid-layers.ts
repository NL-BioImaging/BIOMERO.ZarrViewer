import { OverviewLayer } from "@hms-dbmi/viv";
import { Matrix4 } from "@math.gl/core";
const singleLevelLoaders = new WeakMap<object, any[]>();

function size(source: any, axis: string): number {
  return source.shape[source.labels.indexOf(axis)];
}

/** Viv indexes tile zooms as powers of two; native WSI pyramids may skip levels. */
export function nonBinaryPyramid(loader: any[]): boolean {
  return loader.length > 1 && loader.some((source, i) =>
    ["x", "y"].some(axis => Math.abs(size(loader[0], axis) / 2 ** i - size(source, axis)) > 1));
}

export function actualScaleProps(props: any, zoom: number): any {
  const loader = props.loader;
  const target = Math.max(1, 2 ** -zoom);
  let level = 0;
  for (let i = 1; i < loader.length; i++) {
    if (size(loader[0], "x") / size(loader[i], "x") <= target) level = i;
  }
  const source = loader[level];
  let single = singleLevelLoaders.get(source);
  if (!single) {single = [source]; singleLevelLoaders.set(source, single);}
  return {...props, loader: single, excludeBackground: true,
    modelMatrix: (props.modelMatrix || new Matrix4()).clone().scale([
      size(loader[0], "x") / size(source, "x"),
      size(loader[0], "y") / size(source, "y"), 1,
    ])};
}

const OverviewBase = OverviewLayer as unknown as new (...props: any[]) => {props: any; renderLayers(): any[]};
export class ActualScaleOverviewLayer extends OverviewBase {
  static layerName = "ActualScaleOverviewLayer";
  renderLayers(): any[] {
    const layers = super.renderLayers();
    const {loader, overviewScale} = this.props;
    const last = loader[loader.length - 1];
    return layers.map((layer, i) => i === 0 && layer ? layer.clone({
      modelMatrix: new Matrix4().scale([
        size(loader[0], "x") / size(last, "x") * overviewScale,
        size(loader[0], "y") / size(last, "y") * overviewScale, 1,
      ]),
    }) : layer);
  }
}
