import { Matrix4, Vector3 } from "@math.gl/core";
import { ColorPalette3DExtensions } from "@hms-dbmi/viv";
import { XR3DLayer } from "@vivjs/layers";
import { OrthographicXR3DLayer, orthographicShaders } from "./orthographic-volume";

test("the actual Viv ray shader is adapted without changing channel rendering",()=>{
  const props:any={id:"ray",selections:[{c:0}],channelsVisible:[true],extensions:[new ColorPalette3DExtensions.MaximumIntensityProjectionExtension({})]};
  const nativeLayer=new XR3DLayer(props), parallelLayer=new OrthographicXR3DLayer(props);
  for (const layer of [nativeLayer,parallelLayer]) Object.assign(layer,{context:{defaultShaderModules:[]}});
  const native:any=nativeLayer.getShaders(), parallel=parallelLayer.getShaders();
  expect(parallel.vs).not.toContain("flat out vec3 transformed_eye;");
  expect(parallel.fs).not.toContain("flat in vec3 transformed_eye;");
  expect(parallel.vs).toContain("inverse(vertex.view) * vec4(0., 0., -1., 0.)");
  expect(parallel.fs).toBe(native.fs.replace("flat in vec3 transformed_eye;","in vec3 transformed_eye;"));
  expect(()=>orthographicShaders({vs:"changed",fs:"changed"})).toThrow(/no longer matches/);
});

test("parallel rays preserve plane coordinates through an anisotropic rotated volume",()=>{
  const model=new Matrix4().rotateY(.4).scale([2,3,7]);
  const inverse=new Matrix4(model).invert();
  const direction=new Vector3(0,0,-1).transformAsVector(inverse).normalize();
  const a=new Vector3(.2,.3,.6), b=new Vector3(.7,.8,.4);
  for(const point of [a,b]) {
    const origin=new Vector3(point).subtract(new Vector3(direction).scale(2));
    const projected=new Vector3(origin).transformAsPoint(model);
    const surface=new Vector3(point).transformAsPoint(model);
    expect(projected[0]).toBeCloseTo(surface[0]);
    expect(projected[1]).toBeCloseTo(surface[1]);
    expect(origin.some(n=>n<0 || n>1)).toBe(true);
  }
});
