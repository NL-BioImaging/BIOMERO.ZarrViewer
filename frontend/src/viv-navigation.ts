import { OrthographicVolumeLayer } from "./orthographic-volume";
import { DetailView, VolumeView } from "@hms-dbmi/viv";

// Around 12% per normal wheel notch, with fractional trackpad updates.
// React owns the shared camera; independent Deck animations would be cancelled
// when another panel receives the new camera state. Apply each small step once.
export const gentleScrollZoom = { speed: 0.0024, smooth: false };
export class GentleVolumeView extends VolumeView {
  orthographic = false;
  getLayers(args:any):any {
    const layers = super.getLayers(args);
    return this.orthographic ? layers.map((layer:any)=>new OrthographicVolumeLayer(layer.props)) : layers;
  }
  getDeckGlView() { return super.getDeckGlView().clone({ orthographic:this.orthographic, controller: { scrollZoom: gentleScrollZoom } }); }
}
export class GentleDetailView extends DetailView {
  getDeckGlView() { return super.getDeckGlView().clone({ controller: { scrollZoom: gentleScrollZoom } }); }
}
