import { neuroglancerState, volumeDepthSamples, type NeuroglancerPrepared } from "./neuroglancer-state";
import type { ChannelState, LabelState } from "./types";
import { coordinateTransformSpecificationFromJson, makeCoordinateSpace, makeIdentityTransform, makeIdentityTransformedBoundingBox, WatchableCoordinateSpaceTransform } from "neuroglancer/unstable/coordinate_transform.js";

const prepared: NeuroglancerPrepared = { status: "ready", url: "/viewer/ng/context/", sources: {
  "image-0": { shape: [236, 68, 67], resolution: [1440, 1440, 500], translation: [100, 200, 300], segmentation: false },
  "label-0": { shape: [236, 275, 271], resolution: [360, 360, 500], translation: [100, 200, 300], segmentation: true, segments: ["1", "9007199254741009"] },
} };
const channels: ChannelState[] = [{ index: 0, label: "DNA", visible: true, color: "#00FF00", low: 100, high: 2000, domainMin: 0, domainMax: 4095 }];
const labels: LabelState[] = [{ id: "nuclei", name: "Nuclei", path: "labels/0", visible: true, opacity: .3, mode: "fill" }];

test("image and segmentation use their own XYZ calibration in one physical coordinate system", () => {
  const state = neuroglancerState(prepared, channels, labels, "additive", true);
  expect(state.layers).toHaveLength(2);
  expect(state.layers[0].source.transform.matrix).toEqual([[1, 0, 0, 100], [0, 1, 0, 200], [0, 0, 1, 300]]);
  expect(state.layers[1].source.transform).toEqual(state.layers[0].source.transform);
  expect(state.layers[0].source.transform.outputDimensions.x).toEqual([1e-9, "m"]);
  for (const [index, item] of Object.values(prepared.sources).entries()) {
    const input = makeCoordinateSpace({ rank: 3, names: ["x", "y", "z"], units: ["m", "m", "m"],
      scales: Float64Array.from(item.resolution.map(value => value * 1e-9)),
      boundingBoxes: [makeIdentityTransformedBoundingBox({ lowerBounds: new Float64Array(3), upperBounds: Float64Array.from(item.shape.slice().reverse()) })],
    });
    const transform = new WatchableCoordinateSpaceTransform(makeIdentityTransform(input));
    transform.spec = coordinateTransformSpecificationFromJson(state.layers[index].source.transform);
    Array.from(transform.value.outputSpace.bounds.upperBounds).forEach((value, axis) =>
      expect(value).toBeCloseTo(item.shape[2 - axis] * item.resolution[axis] + item.translation[axis], 5));
  }
  expect(state.layers[1].segments).toEqual(["1", "9007199254741009"]);
  expect(state.layers[0].volumeRendering).toBe("on");
  expect(state.layers[0].shader).toContain("toRaw(getInterpolatedDataValue())");
  expect(state.showScaleBar).toBe(true);
});

test("ray spacing resolves thin neurites at arbitrary rotations and uses physical anisotropy", () => {
  const neuron = { shape: [60, 512, 512], resolution: [329.648522, 329.648522, 998.8], translation: [0,0,0], segmentation: false };
  const diagonal = Math.hypot(...neuron.resolution.map((spacing, i) => spacing * neuron.shape[2-i]));
  expect(diagonal / (64-1)).toBeGreaterThan(neuron.resolution[0] * 10);
  expect(diagonal / (volumeDepthSamples(neuron)-1)).toBeLessThanOrEqual(neuron.resolution[0] / 2);
  const coarser = { ...neuron, shape: [60,256,256], resolution: [659.297044,659.297044,998.8] };
  expect(volumeDepthSamples(coarser)).toBeLessThan(volumeDepthSamples(neuron));
  // Merely changing physical units cannot change the chosen sampling density.
  expect(volumeDepthSamples({ ...neuron, resolution: neuron.resolution.map(x => x/1000) })).toBe(volumeDepthSamples(neuron));
});

test("intensity sampling is bounded and never changes segmentation sampling", () => {
  expect(volumeDepthSamples({ shape: [10000,10000,10000], resolution: [1,1,1], translation: [0,0,0], segmentation: false })).toBe(8192);
  const state = neuroglancerState(prepared, channels, labels, "maximum", true);
  expect(state.layers[0].volumeRenderingDepthSamples).toBeGreaterThan(64);
  expect(state.layers[1]).not.toHaveProperty("volumeRenderingDepthSamples");
  expect(state.layers[1]).not.toHaveProperty("shader");
});

test("label appearance, visibility and intensity projection modes are applied independently", () => {
  const state = neuroglancerState(prepared, channels, [{ ...labels[0], color: "#FF0000", opacity: .8, highlightValue: 1 }], "maximum", false);
  expect(state.layers[0].volumeRendering).toBe("max");
  expect(state.layers[1]).toMatchObject({ segmentDefaultColor: "#FF0000", objectAlpha: .8, segments: ["1"] });
  expect(state.showScaleBar).toBe(false);
  expect(neuroglancerState(prepared, channels, [{ ...labels[0], visible: false }], "minimum", true).layers).toHaveLength(1);
  expect(neuroglancerState(prepared, [], labels, "additive", true).layers[0].type).toBe("segmentation");
});

test("3D brightness changes only image shaders and leaves segmentation appearance untouched", () => {
  const normal = neuroglancerState(prepared, channels, labels, "additive", true);
  const bright = neuroglancerState(prepared, channels, labels, "additive", true, 2, -1);
  expect(bright.layers[0].shader).not.toEqual(normal.layers[0].shader);
  expect(bright.layers[1]).toEqual(normal.layers[1]);
  expect(bright.layers[0].volumeRenderingGain).toBe(-1);
  expect(bright.projectionBackgroundColor).toBe(normal.projectionBackgroundColor);
});

test("native Zarr streaming maps ZYX axes into the same physical XYZ space", () => {
  const native: NeuroglancerPrepared = { ...prepared, sources: { "image-0": { ...prepared.sources["image-0"], transport: "zarr" } } };
  const state = neuroglancerState(native, channels, [], "maximum", true);
  expect(state.layers[0].source.url).toContain("/image-0/zarr/|zarr2:");
  const item = native.sources["image-0"];
  const input = makeCoordinateSpace({rank:3,names:["z","y","x"],units:["m","m","m"],
    scales:Float64Array.from(item.resolution.slice().reverse().map(v=>v*1e-9)),
    boundingBoxes:[makeIdentityTransformedBoundingBox({lowerBounds:new Float64Array(3),upperBounds:Float64Array.from(item.shape)})]});
  const transform = new WatchableCoordinateSpaceTransform(makeIdentityTransform(input));
  transform.spec = coordinateTransformSpecificationFromJson(state.layers[0].source.transform);
  Array.from(transform.value.outputSpace.bounds.upperBounds).forEach((v,a)=>
    expect(v).toBeCloseTo(item.shape[2-a]*item.resolution[a]+item.translation[a],5));
});

test("only small explicitly selected browser meshes use the worker provider", () => {
  const scene: NeuroglancerPrepared = {...prepared,sources:{...prepared.sources,"label-0":{...prepared.sources["label-0"],browser_segments:["1"]}}};
  const state=neuroglancerState(scene,channels,labels,"maximum",true);
  expect(state.layers[1].source[0].subsources).toEqual({default:true,mesh:false});
  expect(state.layers[1].source[1].url).toContain("biomeromesh://");
});

test('clipping updates shader uniforms without recompiling the image shader or changing source URLs',()=>{
  const full=neuroglancerState(prepared,channels,labels,'maximum',true);
  const clip=neuroglancerState(prepared,channels,labels,'maximum',true,1,-3,[[.25,.75],[0,1],[0,1]]);
  expect(clip.layers[0].shader).toBe(full.layers[0].shader);
  expect(clip.layers[0].shaderControls).toMatchObject({biomeroClipXMin:.25,biomeroClipXMax:.75});
  expect(clip.layers[0].source).toEqual(full.layers[0].source);
  expect(clip.biomeroClip).toEqual([[24220,200,300],[72460,98120,118300]]);
});

test('selected memory budget reaches Neuroglancer without changing its data source',()=>{
  const low=neuroglancerState(prepared,channels,labels,'maximum',true,1,-3,undefined,100*1024*1024);
  const high=neuroglancerState(prepared,channels,labels,'maximum',true,1,-3,undefined,500*1024*1024);
  expect(low.gpuMemoryLimit).toBe(100*1024*1024);
  expect(high.gpuMemoryLimit).toBe(500*1024*1024);
  expect(high.systemMemoryLimit).toBe(high.gpuMemoryLimit);
  expect(high.layers[0].source).toEqual(low.layers[0].source);
});
