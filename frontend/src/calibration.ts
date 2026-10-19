import type { Axis, Capability } from "./types";
const micrometers:Record<string,number>={meter:1e6,metre:1e6,centimeter:1e4,centimetre:1e4,millimeter:1e3,millimetre:1e3,micrometer:1,micrometre:1,um:1,"µm":1,nanometer:.001,nanometre:.001,nm:.001,picometer:1e-6,picometre:1e-6,pm:1e-6};
export function calibratedAxes(axes:Axis[],transforms:any[] = []) {
  const scale=axes.map(()=>1),origin=axes.map(()=>0);
  for(const t of transforms){
    if(t?.type==="scale"&&Array.isArray(t.scale)) t.scale.forEach((n:number,i:number)=>{if(Number.isFinite(n)&&n>0){scale[i]*=n;origin[i]*=n;}});
    if(t?.type==="translation"&&Array.isArray(t.translation)) t.translation.forEach((n:number,i:number)=>{if(Number.isFinite(n))origin[i]+=n;});
  }
  return Object.fromEntries(axes.map((a,i)=>{
    const unit=a.unit?.trim().toLowerCase()||"pixel",factor=micrometers[unit];
    return [a.name,{size:scale[i]*(factor??1),origin:origin[i]*(factor??1),unit:factor==null?unit:"micrometer"}];
  }));
}
export function capabilityCalibration(capability:Capability|null|undefined) {
  return calibratedAxes(capability?.axes||[],(capability?.datasets?.[0]?.coordinate_transformations||[]) as any[]);
}

/** Map voxel centers through physical space, including independent label grids. */
export function mapVoxel(source:any,target:any,axis:string,index:number) {
  const a=source.meta?.physicalSizes?.[axis],b=target.meta?.physicalSizes?.[axis];
  if(!a||!b)return index;
  if(a.unit!==b.unit)throw new Error("The image and label calibration units are incompatible.");
  return ((index+.5)*a.size+(source.meta?.physicalOrigin?.[axis]||0)-(target.meta?.physicalOrigin?.[axis]||0))/b.size-.5;
}
