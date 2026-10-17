import { interactiveMesh } from "./browser-mesh";

test("interactive previews close edge objects and preserve physical bounds and winding", () => {
  const mask = new Uint8Array(3*4*5).fill(1);
  const bytes = interactiveMesh(mask,{shape:[3,4,5],origin:[2,3,4],resolution:[100,200,500]});
  const view = new DataView(bytes.buffer), count=view.getUint32(0,true);
  const points = Array.from({length:count},(_,i) => [0,1,2].map(a => view.getFloat32(4+i*12+a*4,true)));
  expect([0,1,2].map(a => Math.min(...points.map(p => p[a])))).toEqual([400,600,1000]);
  expect([0,1,2].map(a => Math.max(...points.map(p => p[a])))).toEqual([900,1400,2500]);
  for (let i=0;i<count;i+=3) {
    const [a,b,c]=points.slice(i,i+3), ab=b.map((v,j)=>v-a[j]), ac=c.map((v,j)=>v-a[j]);
    const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const fromCenter=[0,1,2].map(j=>(a[j]+b[j]+c[j])/3-[650,1000,1750][j]);
    expect(normal.reduce((sum,v,j)=>sum+v*fromCenter[j],0)).toBeGreaterThan(0);
  }
});

test("empty masks and oversized interactive requests remain bounded", () => {
  expect(new DataView(interactiveMesh(new Uint8Array(8),{shape:[2,2,2],origin:[0,0,0],resolution:[1,1,1]}).buffer).getUint32(0,true)).toBe(0);
  expect(()=>interactiveMesh(new Uint8Array(),{shape:[128,128,128],origin:[0,0,0],resolution:[1,1,1]})).toThrow(/budget/);
});


test("interactive mesh surface complexity cannot exceed its output budget", () => {
  const n=50,mask=new Uint8Array(n*n*n);
  for(let z=0;z<n;z++) for(let y=0;y<n;y++) for(let x=0;x<n;x++) mask[(z*n+y)*n+x]=(x+y+z)%2;
  expect(()=>interactiveMesh(mask,{shape:[n,n,n],origin:[0,0,0],resolution:[1,1,1]})).toThrow(/complex/);
});
