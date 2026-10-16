import { MouseEventBinder, EventActionMap, registerActionListener } from "neuroglancer/unstable/util/mouse_bindings.js";
import { configureVolumeWheel, depthWheelStep, wheelZoomFactor } from "./neuroglancer-controls";

test("real wheel events dispatch zoom normally and calibrated depth with Ctrl", () => {
  const target = document.createElement("div");
  const root = document.createElement("div");
  root.appendChild(target);
  document.body.appendChild(root);
  const bindings = EventActionMap.fromObject({ "at:wheel": "z+1-via-wheel", "control+wheel": "zoom-via-wheel" });
  configureVolumeWheel(bindings);
  const binder = new MouseEventBinder(target, bindings);
  const zoom = vi.fn();
  const depth = vi.fn();
  const removeZoom = registerActionListener<WheelEvent>(root, "biomero-zoom-via-wheel", event => zoom(wheelZoomFactor(event.detail.deltaY, event.detail.deltaMode)));
  const removeDepth = registerActionListener<WheelEvent>(root, "biomero-depth-via-wheel", event => depth(depthWheelStep(event.detail.deltaY, event.detail.deltaMode, 500)));
  const normal = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
  target.dispatchEvent(normal);
  expect(zoom).toHaveBeenCalledTimes(1);
  expect(zoom).toHaveBeenCalledWith(1.12);
  expect(depth).not.toHaveBeenCalled();
  const ctrl = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
  target.dispatchEvent(ctrl);
  expect(zoom).toHaveBeenCalledTimes(1);
  expect(depth).toHaveBeenCalledWith(-5000);
  expect(normal.defaultPrevented).toBe(true);
  expect(ctrl.defaultPrevented).toBe(true);
  removeZoom(); removeDepth(); binder.dispose(); root.remove();
});

test("depth stepping uses source spacing for pixel, line and page wheels", () => {
  expect(depthWheelStep(100, 0, 500)).toBe(5000);
  expect(depthWheelStep(3, 1, 500)).toBe(5000);
  expect(depthWheelStep(1, 2, 500)).toBe(50000);
  expect(depthWheelStep(0, 0, 500)).toBe(0);
});

test("zoom has consistent, reversible notch and smooth trackpad speeds", () => {
  expect(wheelZoomFactor(100, 0)).toBeCloseTo(1.12);
  expect(wheelZoomFactor(-100, 0) * wheelZoomFactor(100, 0)).toBeCloseTo(1);
  expect(wheelZoomFactor(3, 1)).toBeCloseTo(1.12);
  expect(wheelZoomFactor(10, 0)).toBeGreaterThan(1);
  expect(wheelZoomFactor(10, 0)).toBeLessThan(1.12);
  expect(wheelZoomFactor(10000, 0)).toBeCloseTo(1.12 ** 4);
});
