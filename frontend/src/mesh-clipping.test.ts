const mesh=vi.hoisted(()=>({shader:undefined as any}));
vi.mock('neuroglancer/unstable/mesh/frontend.js',()=>({MeshShaderManager:class{
  vertexPositionHandler={defineShader:(_builder?:any)=>{}};
  makeGetter(){const uniforms=new Set<string>();const builder={
    addVarying:vi.fn(),addUniform:vi.fn((_type:string,name:string)=>{if(uniforms.has(name))throw Error('duplicate uniform');uniforms.add(name);}),
    setVertexMain:vi.fn((_code?:string)=>{}),setFragmentMain:vi.fn((_code?:string)=>{}),
  };const originalVertex=builder.setVertexMain,originalFragment=builder.setFragmentMain;this.vertexPositionHandler.defineShader(builder as never);builder.setVertexMain('vec3 vertexPosition = getVertexPosition();' as never);builder.setFragmentMain('emit(vColor,uPickID);' as never);mesh.shader={...builder,originalVertex,originalFragment};return builder;}
  beginModel(){}
}}));
import {MeshShaderManager} from 'neuroglancer/unstable/mesh/frontend.js';
import {installMeshClipping} from '../neuroglancer/mesh-clipping';
test('Neuroglancer mesh clipping preserves renderer code, updates uniforms and avoids repeated wrapping',()=>{
  let bounds:number[][]|undefined;
  installMeshClipping(()=>bounds);
  const manager=new (MeshShaderManager as any)();manager.makeGetter({});
  expect(mesh.shader.originalVertex).toHaveBeenCalledWith(expect.stringContaining('uBiomeroClipModel * vec4(vertexPosition'));
  expect(mesh.shader.originalFragment).toHaveBeenCalledWith(expect.stringContaining('discard;\nemit(vColor,uPickID);'));
  manager.makeGetter({}); // A new emitter must not add the same uniforms twice.
  const gl={uniformMatrix4fv:vi.fn(),uniform1i:vi.fn(),uniform3fv:vi.fn()},shader={uniform:(key:string)=>key};
  manager.beginModel(gl,shader,{},[1]);expect(gl.uniform1i).toHaveBeenLastCalledWith('uBiomeroClipEnabled',0);
  bounds=[[2,3,4],[5,6,7]];manager.beginModel(gl,shader,{},[1]);
  expect(gl.uniform1i).toHaveBeenLastCalledWith('uBiomeroClipEnabled',1);
  expect(gl.uniform3fv).toHaveBeenCalledWith('uBiomeroClipLower',[2,3,4]);
});
