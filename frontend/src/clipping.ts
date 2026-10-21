export type ClipRange = [number, number];
export type ClippingBounds = [ClipRange, ClipRange, ClipRange];
export const fullClipping = (): ClippingBounds => [[0,1],[0,1],[0,1]];
export function clippingActive(bounds?:ClippingBounds):boolean {
  return !!bounds?.some(([low,high])=>low>0||high<1);
}
export function physicalClipBounds(shape:number[],resolution:number[],translation:number[],bounds?:ClippingBounds) {
  if(!clippingActive(bounds))return undefined;
  return [0,1].map(side=>resolution.map((spacing,axis)=>translation[axis]+bounds![axis][side]*shape[2-axis]*spacing));
}

/** Volume-only code: never refer to volume uniforms in the slice/histogram shader. */
export const neuroglancerClipControls=['X','Y','Z'].flatMap(axis=>['Min','Max'].map(side=>`#uicontrol float biomeroClip${axis}${side} slider(min=0,max=1,default=${side==='Min'?0:1})`)).join('\n')+'\n';
export function neuroglancerClipValues(bounds:ClippingBounds=fullClipping()):Record<string,number>{
  return Object.fromEntries(['X','Y','Z'].flatMap((axis,i)=>['Min','Max'].map((side,j)=>[`biomeroClip${axis}${side}`,bounds[i][j]])));
}
export function neuroglancerClipShader(shape:number[]):string {
  return `\n#ifdef VOLUME_RENDERING\nvec3 clipPosition = (curChunkPosition + uTranslation)/vec3(${shape.slice().reverse().map(n=>n.toFixed(8)).join(',')});\nif(any(lessThan(clipPosition,vec3(biomeroClipXMin,biomeroClipYMin,biomeroClipZMin))) || any(greaterThanEqual(clipPosition,vec3(biomeroClipXMax,biomeroClipYMax,biomeroClipZMax)))) return;\n#endif\n`;
}
