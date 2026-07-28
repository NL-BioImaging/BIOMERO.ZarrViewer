import { VivLayerExtension } from "@hms-dbmi/viv";

const moduleName = "instanceColorModule";

const instanceColorModule = {
  name: moduleName,
  uniformTypes: {
    opacity: "f32",
    outlineOnly: "u32",
    fixedColor: "u32",
    highlightCount: "u32",
    highlight0: "u32",
    highlight1: "u32",
    highlight2: "u32",
    highlight3: "u32",
    highlight4: "u32",
    highlight5: "u32",
    highlight6: "u32",
    highlight7: "u32",
    outlineWidth: "u32",
    layerColor: "vec3<f32>",
  },
  fs: `
uniform instanceColorModuleUniforms {
  float opacity;
  uint outlineOnly;
  uint fixedColor;
  uint highlightCount;
  uint highlight0;
  uint highlight1;
  uint highlight2;
  uint highlight3;
  uint highlight4;
  uint highlight5;
  uint highlight6;
  uint highlight7;
  uint outlineWidth;
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

bool biomero_selected(uint value) {
  if (value == 0u) return false;
  if (instanceColorModule.highlightCount == 0u) return true;
  return
    (instanceColorModule.highlightCount > 0u && value == instanceColorModule.highlight0) ||
    (instanceColorModule.highlightCount > 1u && value == instanceColorModule.highlight1) ||
    (instanceColorModule.highlightCount > 2u && value == instanceColorModule.highlight2) ||
    (instanceColorModule.highlightCount > 3u && value == instanceColorModule.highlight3) ||
    (instanceColorModule.highlightCount > 4u && value == instanceColorModule.highlight4) ||
    (instanceColorModule.highlightCount > 5u && value == instanceColorModule.highlight5) ||
    (instanceColorModule.highlightCount > 6u && value == instanceColorModule.highlight6) ||
    (instanceColorModule.highlightCount > 7u && value == instanceColorModule.highlight7);
}

vec4 biomero_label_color(float rawValue) {
  uint value = uint(round(rawValue));
  if (!biomero_selected(value)) return vec4(0.0);
  vec3 color = instanceColorModule.fixedColor != 0u ? instanceColorModule.layerColor : biomero_hash_color(value);
  return vec4(color, instanceColorModule.opacity);
}
`,
  inject: {
    "fs:DECKGL_PROCESS_INTENSITY": "intensity = intensity;",
    "fs:DECKGL_MUTATE_COLOR": `
      rgba = biomero_label_color(intensity[0]);
    `,
    // Viv declares channel0 in its application shader, after module functions
    // have been emitted. Texture sampling in DECKGL_MUTATE_COLOR therefore
    // fails on strict GLSL compilers because channel0 is not yet in scope.
    // A main-end injection is emitted after the sampler declaration and keeps
    // neighbourhood sampling available for outline rendering.
    "fs:#main-end": `
      if (instanceColorModule.outlineOnly != 0u) {
        uint biomeroValue = uint(round(intensity[0]));
        bool biomeroVisible = biomero_selected(biomeroValue);
        bool biomeroBoundary = false;
        if (biomeroVisible) {
          vec2 biomeroScreenStep = max(abs(dFdx(vTexCoord)), abs(dFdy(vTexCoord)));
          for (int biomeroRadius = 1; biomeroRadius <= 8; biomeroRadius++) {
            if (uint(biomeroRadius) > instanceColorModule.outlineWidth) break;
            vec2 delta = biomeroScreenStep * float(biomeroRadius);
            uint leftValue = uint(texture(channel0, clamp(vTexCoord - vec2(delta.x, 0.0), vec2(0.0), vec2(1.0))).r);
            uint rightValue = uint(texture(channel0, clamp(vTexCoord + vec2(delta.x, 0.0), vec2(0.0), vec2(1.0))).r);
            uint upValue = uint(texture(channel0, clamp(vTexCoord - vec2(0.0, delta.y), vec2(0.0), vec2(1.0))).r);
            uint downValue = uint(texture(channel0, clamp(vTexCoord + vec2(0.0, delta.y), vec2(0.0), vec2(1.0))).r);
            if (!biomero_selected(leftValue) || !biomero_selected(rightValue) || !biomero_selected(upValue) || !biomero_selected(downValue)) {
              biomeroBoundary = true;
            }
          }
        }
        fragColor = biomeroBoundary ? biomero_label_color(intensity[0]) : vec4(0.0);
      }
    `,
  },
};

export class InstanceColorExtension extends VivLayerExtension {
  static extensionName = "InstanceColorExtension";
  static defaultProps = {
    opacity: { type: "number", value: 0.3, compare: true },
    labelMode: { type: "string", value: "fill", compare: true },
    labelColor: { type: "array", value: null, compare: true },
    highlightValues: { type: "array", value: [], compare: true },
    outlineWidth: { type: "number", value: 2, compare: true },
  };

  getVivShaderTemplates() {
    return { modules: [instanceColorModule] };
  }

  updateState(this: any, params: unknown): void {
    super.updateState.call(this, params as never, this as never);
    const color = Array.isArray(this.props.labelColor) ? this.props.labelColor.map((value: number) => value / 255) : [0, 0, 0];
    const highlights = Array.isArray(this.props.highlightValues)
      ? [...new Set(this.props.highlightValues.map((value: number) => Math.max(0, Math.floor(value))).filter(Boolean))].slice(0, 8)
      : [];
    const uniforms: Record<string, unknown> = {
      opacity: this.props.opacity ?? 0.3,
      outlineOnly: this.props.labelMode === "outline" ? 1 : 0,
      fixedColor: Array.isArray(this.props.labelColor) ? 1 : 0,
      highlightCount: highlights.length,
      outlineWidth: Math.max(1, Math.min(8, Math.floor(this.props.outlineWidth || 2))),
      layerColor: color,
    };
    for (let index = 0; index < 8; index++) uniforms[`highlight${index}`] = highlights[index] || 0;
    for (const model of this.getModels()) model.shaderInputs.setProps({ [moduleName]: uniforms });
  }
}
