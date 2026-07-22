import { VivLayerExtension } from "@hms-dbmi/viv";

const moduleName = "instanceColorModule";

const instanceColorModule = {
  name: moduleName,
  uniformTypes: {
    opacity: "f32",
    outlineOnly: "u32",
    fixedColor: "u32",
    layerColor: "vec3<f32>",
  },
  fs: `
uniform instanceColorModuleUniforms {
  float opacity;
  uint outlineOnly;
  uint fixedColor;
  vec3 layerColor;
} instanceColorModule;

uint biomero_hash(uint value) {
  value ^= value >> 16;
  value *= 0x7feb352du;
  value ^= value >> 15;
  value *= 0x846ca68bu;
  value ^= value >> 16;
  return value;
}

vec3 biomero_hash_color(uint value) {
  uint h = biomero_hash(value);
  return vec3(float(h & 255u), float((h >> 8) & 255u), float((h >> 16) & 255u)) / 255.0;
}

vec4 biomero_label_color(float rawValue) {
  uint value = uint(round(rawValue));
  if (value == 0u) return vec4(0.0);
  vec3 color = instanceColorModule.fixedColor != 0u ? instanceColorModule.layerColor : biomero_hash_color(value);
  return vec4(color, instanceColorModule.opacity);
}
`,
  inject: {
    "fs:DECKGL_PROCESS_INTENSITY": "intensity = intensity;",
    "fs:DECKGL_MUTATE_COLOR": `
      bool biomeroBoundary = true;
      if (instanceColorModule.outlineOnly != 0u && intensity[0] > 0.0) {
        biomeroBoundary = fwidth(intensity[0]) > 0.0;
      }
      rgba = biomeroBoundary ? biomero_label_color(intensity[0]) : vec4(0.0);
    `,
  },
};

export class InstanceColorExtension extends VivLayerExtension {
  static extensionName = "InstanceColorExtension";
  static defaultProps = {
    opacity: { type: "number", value: 0.15, compare: true },
    labelMode: { type: "string", value: "fill", compare: true },
    labelColor: { type: "array", value: null, compare: true },
  };

  getVivShaderTemplates() {
    return { modules: [instanceColorModule] };
  }

  updateState(this: any, params: unknown): void {
    super.updateState.call(this, params as never, this as never);
    const color = Array.isArray(this.props.labelColor) ? this.props.labelColor.map((value: number) => value / 255) : [0, 0, 0];
    const uniforms = {
      opacity: this.props.opacity ?? 0.15,
      outlineOnly: this.props.labelMode === "outline" ? 1 : 0,
      fixedColor: Array.isArray(this.props.labelColor) ? 1 : 0,
      layerColor: color,
    };
    for (const model of this.getModels()) model.shaderInputs.setProps({ [moduleName]: uniforms });
  }
}
