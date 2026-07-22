import { forceNearestInterpolation } from "./categorical-image-layer";

test("categorical image sublayers always use nearest interpolation", () => {
  const clone = vi.fn((props) => props);
  expect(forceNearestInterpolation({ clone })).toEqual({ interpolation: "nearest" });
  expect(clone).toHaveBeenCalledWith({ interpolation: "nearest" });
});
