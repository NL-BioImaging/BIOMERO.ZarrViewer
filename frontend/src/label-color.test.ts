import { labelIdColor } from "./label-color";

test("label colors are deterministic and do not require a color table", () => {
  expect(labelIdColor(123456)).toEqual(labelIdColor(123456));
  expect(labelIdColor(123456)).not.toEqual(labelIdColor(123457));
  expect(labelIdColor(0).every((value) => value === 0)).toBe(true);
});

