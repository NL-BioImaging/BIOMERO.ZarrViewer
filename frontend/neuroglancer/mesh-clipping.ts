import { MeshShaderManager } from 'neuroglancer/unstable/mesh/frontend.js';

/** Extend the pinned Neuroglancer shader builder, retaining its mesh renderer,
 * lighting, selection, picking and cached geometry. Bounds use global XYZ units.
 */
export function installMeshClipping(bounds:()=>number[][]|undefined) {
  const proto=MeshShaderManager.prototype as any;
  const make=proto.makeGetter,begin=proto.beginModel;
  const configured=new WeakSet<object>();
  proto.makeGetter=function(layer:any){
    if(configured.has(this))return make.call(this,layer);
    configured.add(this);
    const handler=this.vertexPositionHandler;
    this.vertexPositionHandler={...handler,defineShader(builder:any){
      handler.defineShader(builder);
      builder.addVarying('highp vec3','vBiomeroClipPosition');
      builder.addUniform('highp mat4','uBiomeroClipModel');
      builder.addUniform('bool','uBiomeroClipEnabled');
      builder.addUniform('highp vec3','uBiomeroClipLower');
      builder.addUniform('highp vec3','uBiomeroClipUpper');
      const vertex=builder.setVertexMain.bind(builder),fragment=builder.setFragmentMain.bind(builder);
      builder.setVertexMain=(code:string)=>vertex(code+'\nvBiomeroClipPosition=(uBiomeroClipModel * vec4(vertexPosition,1.0)).xyz;');
      builder.setFragmentMain=(code:string)=>fragment('if(uBiomeroClipEnabled && (any(lessThan(vBiomeroClipPosition,uBiomeroClipLower)) || any(greaterThanEqual(vBiomeroClipPosition,uBiomeroClipUpper)))) discard;\n'+code);
    }};
    return make.call(this,layer);
  };
  proto.beginModel=function(gl:any,shader:any,context:any,model:any){
    begin.call(this,gl,shader,context,model);
    const clip=bounds();
    gl.uniformMatrix4fv(shader.uniform('uBiomeroClipModel'),false,model);
    gl.uniform1i(shader.uniform('uBiomeroClipEnabled'),clip?1:0);
    gl.uniform3fv(shader.uniform('uBiomeroClipLower'),clip?.[0]||[0,0,0]);
    gl.uniform3fv(shader.uniform('uBiomeroClipUpper'),clip?.[1]||[0,0,0]);
  };
}
