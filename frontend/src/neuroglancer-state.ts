import { IMAGE_BACKGROUND } from "./viewer-appearance";
import type { ChannelState, LabelState, VolumeBlendMode } from "./types";
import { neuroglancerClipShader,neuroglancerClipControls,neuroglancerClipValues,physicalClipBounds,type ClippingBounds } from './clipping';

export interface NeuroglancerCamera { position: number[]; orientation: number[]; scale: number; crossSectionScale?: number }
export interface NeuroglancerSource {
  shape: number[]; resolution: number[]; translation: number[]; segmentation: boolean; segments?: string[]; transport?: "zarr" | "chunks"; browser_segments?: string[]; mesh_errors?: Record<string, string>;
}
export interface NeuroglancerPrepared { status: "ready"; pending?: boolean; url: string; sources: Record<string, NeuroglancerSource> }

/** Sample at least twice per smallest physical voxel along any viewing angle.
 * Neuroglancer's default is 64 samples across the whole volume, not per chunk.
 * Use the physical diagonal as a rotation-independent upper bound on ray depth.
 */
export function volumeDepthSamples(source: NeuroglancerSource): number {
  const extent = source.resolution.map((spacing, axis) => spacing * source.shape[2 - axis]);
  const minimumSpacing = Math.min(...source.resolution);
  const samples = Math.ceil(2 * Math.hypot(...extent) / minimumSpacing) + 1;
  return Number.isFinite(samples) && minimumSpacing > 0 ? Math.max(256, Math.min(8192, samples)) : 256;
}

export function neuroglancerState(prepared: NeuroglancerPrepared, channels: ChannelState[], labels: LabelState[], blend: VolumeBlendMode, showScale: boolean, brightness = 1, gain = -3,clipping?:ClippingBounds) {
  const dimensions = { x: [1e-9, "m"], y: [1e-9, "m"], z: [1e-9, "m"] };
  const source = (name: string, item: NeuroglancerSource) => ({
    url: item.transport === "zarr" && !item.segmentation
      ? `${new URL(prepared.url + name + "/zarr/", window.location.href).href}|zarr2:`
      : `precomputed://${new URL(prepared.url + name + "/", window.location.href).href}`,
    // Neuroglancer converts the source's declared voxel units into output
    // units itself. The matrix only adds translation; scaling again doubles it.
    transform: { outputDimensions: dimensions, matrix: item.resolution.map((_, axis) => [
      ...(item.transport === "zarr" && !item.segmentation
        ? [axis === 2 ? 1 : 0, axis === 1 ? 1 : 0, axis === 0 ? 1 : 0]
        : [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0]), item.translation[axis],
    ]) },
  });
  const layers: any[] = [];
  for (const channel of channels.filter(c => c.visible).slice(0, 10)) {
    const item = prepared.sources[`image-${channel.index}`];
    if (!item) continue;
    const rgb = [1, 3, 5].map(offset => (parseInt(channel.color.slice(offset, offset + 2), 16) / 255).toFixed(8));
    const low = Number.isFinite(channel.low) ? channel.low : 0;
    const range = Math.max(1e-12, channel.high - low);
    layers.push({ type: "image", name: `Image ${channel.index + 1}: ${channel.label}`, source: source(`image-${channel.index}`, item),
      volumeRendering: blend === "maximum" ? "max" : blend === "minimum" ? "min" : "on",
      volumeRenderingGain: gain,
      volumeRenderingDepthSamples: volumeDepthSamples(item),
      // Raw intensity values preserve the same contrast limits as the 2D view.
      shaderControls: neuroglancerClipValues(clipping), opacity: 1, blend: "additive",
      shader: `${neuroglancerClipControls}void main() { ${neuroglancerClipShader(item.shape)} float v = clamp((float(toRaw(getInterpolatedDataValue())) - ${low.toExponential(8)}) / ${range.toExponential(8)} * ${brightness.toFixed(8)}, 0.0, 1.0); emitIntensity(v); float alpha = 1.0;\n#ifdef VOLUME_RENDERING\nalpha = ${blend === "additive" ? "v" : "1.0"};\n#endif\nemitRGBA(vec4(vec3(${rgb.join(",")}) * v, alpha)); }`,
    });
  }
  labels.filter(label => label.visible).forEach((label, index) => {
    const item = prepared.sources[`label-${index}`];
    if (!item) return;
    const selected = label.highlightValues?.length ? label.highlightValues.map(String) : label.highlightValue ? [String(label.highlightValue)] : item.segments || [];
    const native = source(`label-${index}`, item);
    const labelSource: any = item.browser_segments?.length ? [
      { ...native, subsources: { default: true, mesh: false } },
      { ...native, url: `biomeromesh://${encodeURIComponent(new URL(prepared.url + `label-${index}/`, window.location.href).href)}/${item.browser_segments.join(",")}/|neuroglancer-precomputed:#type=mesh` },
    ] : native;
    layers.push({ type: "segmentation", name: `Labels ${index + 1}: ${label.name}`, source: labelSource,
      segments: selected.filter(id => (item.segments || []).includes(id)), objectAlpha: label.opacity, selectedAlpha: label.opacity, notSelectedAlpha: 0,
      ...(label.color ? { segmentDefaultColor: label.color } : {}), hideSegmentZero: true });
  });
  const first = Object.values(prepared.sources)[0];
  const extent = first.shape.slice().reverse().map((size, axis) => size * first.resolution[axis]);
  return { dimensions, biomeroClip:physicalClipBounds(first.shape,first.resolution,first.translation,clipping), position: extent.map((size, axis) => size / 2 + first.translation[axis]), projectionScale: Math.max(...extent) * 1.5,
    crossSectionScale: Math.max(...extent) / 500, crossSectionOrientation: [0, 0, 0, 1],
    projectionOrientation: [0, 0, 0, 1], layers, layout: "3d", showSlices: false, showAxisLines: false,
    showScaleBar: showScale, showDefaultAnnotations: false, projectionBackgroundColor: IMAGE_BACKGROUND, crossSectionBackgroundColor: IMAGE_BACKGROUND, gpuMemoryLimit: 512 * 1024 * 1024, systemMemoryLimit: 512 * 1024 * 1024 };
}
