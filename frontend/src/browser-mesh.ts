/** Bounded marching-tetrahedra preview, executed in Neuroglancer's chunk worker. */
export interface MeshInput { shape: number[]; origin: number[]; resolution: number[] }
export const MAX_INTERACTIVE_VOXELS = 262144;
export const MAX_INTERACTIVE_MESH_BYTES = 8 * 1024 * 1024;

export function interactiveMesh(mask: Uint8Array, input: MeshInput): Uint8Array {
  const [nz, ny, nx] = input.shape;
  if (input.shape.length !== 3 || input.origin.length !== 3 || input.resolution.length !== 3 ||
      !input.shape.every(n => Number.isSafeInteger(n) && n > 0) ||
      !input.origin.every(Number.isFinite) || !input.resolution.every(n => Number.isFinite(n) && n > 0) ||
      (nz + 2) * (ny + 2) * (nx + 2) > MAX_INTERACTIVE_VOXELS || mask.length !== nz * ny * nx) {
    throw new Error("Interactive mesh exceeds the browser preview budget");
  }
  const vertices: number[] = [];
  const corners = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  const tetrahedra = [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  const at = (x: number,y: number,z: number) => x >= 0 && x < nx && y >= 0 && y < ny && z >= 0 && z < nz
    ? mask[(z * ny + y) * nx + x] !== 0 : false;
  for (let z=-1; z<nz; ++z) for (let y=-1; y<ny; ++y) for (let x=-1; x<nx; ++x) {
    const values = corners.map(([dx,dy,dz]) => at(x+dx,y+dy,z+dz));
    if (values.every(v => v === values[0])) continue;
    const points = corners.map(([dx,dy,dz]) => [x+dx+.5, y+dy+.5, z+dz+.5]);
    for (const tet of tetrahedra) {
      const inside = tet.filter(i => values[i]), outside = tet.filter(i => !values[i]);
      if (!inside.length || !outside.length) continue;
      const edge = (a: number,b: number) => points[a].map((v,i) => (v+points[b][i])/2);
      const triangles = inside.length === 2
        ? [[edge(inside[0],outside[0]),edge(inside[0],outside[1]),edge(inside[1],outside[1])],
           [edge(inside[0],outside[0]),edge(inside[1],outside[1]),edge(inside[1],outside[0])]]
        : [((inside.length === 1 ? outside : inside).map(i => edge((inside.length === 1 ? inside : outside)[0], i)))];
      const outward = [0,1,2].map(axis => outside.reduce((a,i) => a+points[i][axis],0)/outside.length - inside.reduce((a,i) => a+points[i][axis],0)/inside.length);
      for (const tri of triangles) {
        const ab = tri[1].map((v,i) => v-tri[0][i]), ac = tri[2].map((v,i) => v-tri[0][i]);
        const cross = [ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
        if (cross.reduce((a,v,i) => a+v*outward[i],0) < 0) [tri[1],tri[2]] = [tri[2],tri[1]];
        for (const point of tri) vertices.push(...point.map((v,axis) => (v+input.origin[2-axis])*input.resolution[axis]));
        if (4+vertices.length/3*16 > MAX_INTERACTIVE_MESH_BYTES) throw new Error("Interactive mesh surface is too complex");
      }
    }
  }
  const count = vertices.length/3;
  const output = new Uint8Array(4+count*16);
  const view = new DataView(output.buffer);
  view.setUint32(0,count,true);
  vertices.forEach((v,i) => view.setFloat32(4+i*4,v,true));
  for (let i=0; i<count; ++i) view.setUint32(4+count*12+i*4,i,true);
  return output;
}
