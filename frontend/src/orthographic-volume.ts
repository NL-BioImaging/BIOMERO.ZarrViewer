import { VolumeLayer, XR3DLayer } from "@vivjs/layers";

/** Viv's stock ray caster always casts from the eye, even with an orthographic
 * viewport. Parallel projection needs a separate, interpolated origin per ray.
 * Keep Viv's texture loading, clipping, color extensions and marching intact.
 */
export function orthographicShaders(shaders:any) {
  const assignment = "vray_dir = positions - transformed_eye;";
  if (!shaders.vs.includes(assignment) || !shaders.fs.includes("flat in vec3 transformed_eye;"))
    throw new Error("The Viv volume shader no longer matches the orthographic adapter");
  return {...shaders,
    vs:shaders.vs.replace("flat out vec3 transformed_eye;", "out vec3 transformed_eye;").replace(assignment, `
      vray_dir = normalize((inverse(vertex.resolution) * inverse(vertex.scale) * inverse(vertex.model) * inverse(vertex.view) * vec4(0., 0., -1., 0.)).xyz);
      // Start beyond the unit-cube diagonal, outside the volume.
      transformed_eye = positions - 2. * vray_dir;`),
    fs:shaders.fs.replace("flat in vec3 transformed_eye;", "in vec3 transformed_eye;")};
}
// Viv declares generic factory types for these runtime classes.
const BaseXR3DLayer = XR3DLayer as any;
const BaseVolumeLayer = VolumeLayer as any;
export class OrthographicXR3DLayer extends BaseXR3DLayer {
  static layerName = "OrthographicXR3DLayer";
  constructor(props:any) { super(props); }
  getShaders():any { return orthographicShaders(super.getShaders()); }
}
export class OrthographicVolumeLayer extends BaseVolumeLayer {
  static layerName = "OrthographicVolumeLayer";
  constructor(props:any) { super(props); }
  renderLayers():any {
    const layer = super.renderLayers();
    return layer instanceof XR3DLayer ? new OrthographicXR3DLayer(layer.props) : layer;
  }
}
