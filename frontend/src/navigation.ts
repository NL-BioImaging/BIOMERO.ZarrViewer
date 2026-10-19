import type { Capability, ViewportState, VolumeCameraState } from "./types";
import type { NeuroglancerCamera } from "./neuroglancer-state";
import type { VolumeView, SlicePlane } from "./VolumeViewControls";
import { capabilityCalibration } from "./calibration";
import { sectionFitZoom, vivVolumePanels } from "./viv-slices";

export interface SharedNavigation {position:number[];unitsPerPixel:number;unit:string}
export function navigationGeometry(capability:Capability,loader:any[],level=0) {
  const base=capabilityCalibration(capability);
  const calibrated=capabilityCalibration({...capability,datasets:capability.datasets?.slice(level)}),source=loader[level];
  const declared=(capability.datasets?.[level]?.coordinate_transformations||[]).some((t:any)=>t.type==="scale");
  const spacing=["x","y","z"].map(a=>declared ? calibrated[a]?.size||1 : (base[a]?.size||1)*(loader[0].shape[loader[0].labels.indexOf(a)]||1)/(source.shape[source.labels.indexOf(a)]||1));
  const origin=["x","y","z"].map(a=>calibrated[a]?.origin||0);
  const shape=["x","y","z"].map(a=>source.shape[source.labels.indexOf(a)]||1);
  return {spacing,origin,shape,unit:calibrated.x?.unit||"pixel",worldUnitSize:Math.min(...["x","y","z"].map(a=>base[a]?.size||1))};
}
type Geometry=ReturnType<typeof navigationGeometry>;
export function fitNavigation(g:Geometry,width:number,height:number,view:VolumeView):SharedNavigation {
  const extent=g.shape.map((n,i)=>n*g.spacing[i]),factor=view==="orthogonal"?.5:1;
  const unitsPerPixel=Math.max(Math.max(extent[0],extent[1])/Math.max(1,width*factor),Math.max(extent[1],extent[2])/Math.max(1,height*factor))/.85;
  return {position:g.shape.map((n,i)=>g.origin[i]+(Math.floor((n-1)/2)+.5)*g.spacing[i]),unitsPerPixel,unit:g.unit};
}
export function from2D(view:ViewportState,z:number,g:Geometry):SharedNavigation {
  return {position:[view.x,view.y,z+.5].map((v,i)=>g.origin[i]+v*g.spacing[i]),unitsPerPixel:g.spacing[0]/2**view.zoom,unit:g.unit};
}
export function to2D(nav:SharedNavigation,g:Geometry):ViewportState {
  return {x:(nav.position[0]-g.origin[0])/g.spacing[0],y:(nav.position[1]-g.origin[1])/g.spacing[1],zoom:Math.log2(g.spacing[0]/nav.unitsPerPixel)};
}
export function navigationZ(nav:SharedNavigation,g:Geometry) {return Math.max(0,Math.min(g.shape[2]-1,Math.floor((nav.position[2]-g.origin[2])/g.spacing[2])));}
export function toNeuroglancer(nav:SharedNavigation,camera:NeuroglancerCamera|undefined,height:number):NeuroglancerCamera {
  const factor=nav.unit==="micrometer"?1000:1;
  return {position:nav.position.map(n=>n*factor),orientation:camera?.orientation||[0,0,0,1],scale:nav.unitsPerPixel*factor*height,crossSectionScale:nav.unitsPerPixel*factor};
}
export function fromNeuroglancer(camera:NeuroglancerCamera,unit:string,height:number,view:VolumeView):SharedNavigation {
  const factor=unit==="micrometer"?1000:1;
  return {position:camera.position.map(n=>n/factor),unitsPerPixel:(view!=="3d"?camera.crossSectionScale||camera.scale/height:camera.scale/height)/factor,unit};
}
export function toViv(nav:SharedNavigation,g:Geometry,camera:VolumeCameraState|undefined,view:VolumeView,plane:SlicePlane,width:number,height:number):VolumeCameraState {
  const smallest=g.worldUnitSize,extent=g.shape.map((n,i)=>n*g.spacing[i]/smallest);
  const zoom=Math.log2(smallest/nav.unitsPerPixel);
  const position=g.shape.map((n,i)=>(nav.position[i]-g.origin[i])/(n*g.spacing[i]));
  const fit=view==="3d"?0:sectionFitZoom(vivVolumePanels(view,plane,width,height),extent);
  return {orbit:camera?.orbit||0,tilt:camera?.tilt||0,zoom,slicePosition:position,sliceTarget:position,sliceZoom:zoom-fit};
}
export function fromViv(camera:VolumeCameraState,g:Geometry):SharedNavigation {
  return {position:(camera.slicePosition||[.5,.5,.5]).map((n,i)=>g.origin[i]+n*g.shape[i]*g.spacing[i]),unitsPerPixel:g.worldUnitSize/2**camera.zoom,unit:g.unit};
}

/** Fit leaves section depth intact; 1:1 uses the level-zero X pixel in CSS pixels. */
export function imageZoomNavigation(g:Geometry,current:SharedNavigation,width:number,height:number,
  view:VolumeView|"2d",plane:SlicePlane,native=false):SharedNavigation {
  if(native)return {...current,position:[...current.position],unitsPerPixel:g.spacing[0],unit:g.unit};
  const extent=g.shape.map((n,i)=>n*g.spacing[i]);
  if(view==="2d"||view==="slice") {
    const [a,b]=view==="2d"?[0,1]:plane==="xy"?[0,1]:plane==="xz"?[0,2]:[1,2];
    const position=[...current.position];
    for(const axis of [a,b])position[axis]=g.origin[axis]+extent[axis]/2;
    return {position,unitsPerPixel:Math.max(extent[a]/Math.max(1,width),extent[b]/Math.max(1,height))/.9,unit:g.unit};
  }
  const fitted=fitNavigation(g,width,height,view);
  // A sphere bound includes the rotated volume without changing its rotation.
  const factor=view==="orthogonal"?.5:1;
  return {...fitted,unitsPerPixel:Math.max(fitted.unitsPerPixel,Math.hypot(...extent)/Math.max(1,Math.min(width,height)*factor)/.9)};
}
