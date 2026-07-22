import { MultiscaleImageLayer } from "@hms-dbmi/viv";

const MultiscaleImageLayerBase = MultiscaleImageLayer as unknown as new (...props: any[]) => {
  renderLayers(): any[];
};

export function forceNearestInterpolation(layer: any): any {
  return layer?.clone ? layer.clone({ interpolation: "nearest" }) : layer;
}

export class CategoricalMultiscaleImageLayer extends MultiscaleImageLayerBase {
  static layerName = "CategoricalMultiscaleImageLayer";

  renderLayers(): any[] {
    const layers = super.renderLayers() as any[];
    return layers.map((layer) => {
      if (!layer) return layer;
      const renderSubLayers = layer.props?.renderSubLayers;
      if (typeof renderSubLayers !== "function") return forceNearestInterpolation(layer);
      return layer.clone({
        renderSubLayers: (props: any) => {
          const rendered = renderSubLayers(props);
          return Array.isArray(rendered) ? rendered.map(forceNearestInterpolation) : forceNearestInterpolation(rendered);
        },
      });
    });
  }
}
