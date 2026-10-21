import { OrthographicVolumeLayer } from "./orthographic-volume";
import { DetailView, VolumeView } from "@hms-dbmi/viv";
import { OrbitController, OrthographicController } from '@deck.gl/core';

function rightButton(event:any):boolean {
  return Boolean(event.rightButton || (event.srcEvent?.buttons&2) || event.srcEvent?.button===2);
}
export class ImageOrbitController extends OrbitController {
  _onPanStart(event:any):boolean {
    if(event.middleButton && !rightButton(event))return false;
    return super._onPanStart({...event,rightButton:rightButton(event)});
  }
}
export class ImagePlaneController extends OrthographicController {
  _onPanStart(event:any):boolean {
    if(event.middleButton && !rightButton(event))return false;
    // OrthographicController's primary gesture pans; do not invert it for RMB.
    return super._onPanStart(rightButton(event)?{...event,rightButton:false,srcEvent:{ctrlKey:false,altKey:false,metaKey:false,shiftKey:false}}:event);
  }
}

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
  getDeckGlView() { return super.getDeckGlView().clone({ orthographic:this.orthographic, controller: {type:ImageOrbitController, scrollZoom: gentleScrollZoom } }); }
}
export class GentleDetailView extends DetailView {
  getDeckGlView() { return super.getDeckGlView().clone({ controller: {type:ImagePlaneController, scrollZoom: gentleScrollZoom } }); }
}
