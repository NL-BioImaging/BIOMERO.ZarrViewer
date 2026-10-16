import { neuroglancerState, type NeuroglancerPrepared } from "./neuroglancer-state";
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
  expect(state.layers[0].shader).toContain("toRaw(getDataValue())");
  expect(state.showScaleBar).toBe(true);
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
  const bright = neuroglancerState(prepared, channels, labels, "additive", true, 2, "#FFFFFF", -1);
  expect(bright.layers[0].shader).not.toEqual(normal.layers[0].shader);
  expect(bright.layers[1]).toEqual(normal.layers[1]);
  expect(bright.layers[0].volumeRenderingGain).toBe(-1);
  expect(bright.projectionBackgroundColor).toBe("#FFFFFF");
});
