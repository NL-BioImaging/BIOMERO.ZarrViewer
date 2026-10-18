import { navigationGeometry, from2D, to2D, fromViv, toViv, fromNeuroglancer, toNeuroglancer, navigationZ } from "./navigation";
import type { Capability } from "./types";

const capability={axes:[{name:"z",unit:"micrometer"},{name:"y",unit:"micrometer"},{name:"x",unit:"micrometer"}],datasets:[
  {path:"0",coordinate_transformations:[{type:"scale",scale:[2,.5,.25]},{type:"translation",translation:[10,20,30]}]},
  {path:"1",coordinate_transformations:[{type:"scale",scale:[4,1,.5]},{type:"translation",translation:[10,20,30]}]},
]} as Capability;
const loaders=[{labels:["z","y","x"],shape:[20,80,100]},{labels:["z","y","x"],shape:[10,40,50]}];

test.each(["3d","slice","orthogonal"] as const)("physical position and zoom round-trip through both engines in %s mode",view=>{
  const geometry=navigationGeometry(capability,loaders), nav=from2D({x:34.5,y:22.5,zoom:1.25},7,geometry);
  expect(nav.position).toEqual([38.625,31.25,25]);
  const ng=fromNeuroglancer(toNeuroglancer(nav,undefined,400),nav.unit,400,view);
  expect(ng).toEqual(nav);
  const viv=fromViv(toViv(nav,geometry,undefined,view,"xz",800,600),geometry);
  nav.position.forEach((v,i)=>expect(viv.position[i]).toBeCloseTo(v));
  expect(viv.unitsPerPixel).toBeCloseTo(nav.unitsPerPixel);
  expect(to2D(viv,geometry)).toEqual({x:34.5,y:22.5,zoom:1.25});
  expect(navigationZ(viv,geometry)).toBe(7);
  const coarse=navigationGeometry(capability,loaders,1), lowered=toViv(nav,coarse,undefined,view,"xy",800,600);
  const restored=fromViv(lowered,coarse);
  restored.position.forEach((v,i)=>expect(v).toBeCloseTo(nav.position[i]));
  expect(restored.unitsPerPixel).toBeCloseTo(nav.unitsPerPixel);
});

test("missing pyramid scales fall back to shape ratios rather than shrinking physical extent",()=>{
  const g=navigationGeometry({...capability,datasets:[capability.datasets![0],{path:"1"}]},loaders,1);
  expect(g.spacing).toEqual([.5,1,4]);
});

test("global transforms compose after dataset transforms and normalize units",()=>{
  const transformed={...capability,axes:[{name:"z",unit:"nanometer"},{name:"y",unit:"nanometer"},{name:"x",unit:"nanometer"}],datasets:[{path:"0",coordinate_transformations:[{type:"scale",scale:[100,200,300]},{type:"translation",translation:[1,2,3]},{type:"scale",scale:[2,2,2]},{type:"translation",translation:[5,5,5]}]}]} as Capability;
  const g=navigationGeometry(transformed,loaders);
  expect(g.spacing).toEqual([.6,.4,.2]);expect(g.origin).toEqual([.011,.009000000000000001,.007]);
});
