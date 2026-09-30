import { parseVectorFragment, validateVectorOverlay, vectorFragment, visibleVectorItems } from "./vector-overlays";

const vectors = { version: 1 as const, items: [
  { kind: "point" as const, x: 12.25, y: 8.5, t: 2, z: 0, color: "#00E5FF", radius: 4 },
  { kind: "line" as const, x: 10, y: 8, x2: 12.25, y2: 8.5, t: 2, z: 0, color: "#FFB300", width: 2, trail: true, dashed: true },
] };

test("subpixel points and time-aware paths round trip through a fragment", () => {
  const parsed = parseVectorFragment(vectorFragment(vectors));
  expect(parsed?.items[0].x).toBe(12.25);
  expect(visibleVectorItems(parsed, 1, 0)).toHaveLength(0);
  expect(visibleVectorItems(parsed, 2, 0)).toHaveLength(2);
  expect(visibleVectorItems(parsed, 3, 0)).toHaveLength(1);
  expect(visibleVectorItems(parsed, 2, 1)).toHaveLength(0);
});

test("malformed and excessive vectors are rejected", () => {
  expect(() => validateVectorOverlay({ version: 1, items: [{ ...vectors.items[0], x: Infinity }] })).toThrow();
  expect(() => validateVectorOverlay({ version: 1, items: Array(257).fill(vectors.items[0]) })).toThrow();
  expect(parseVectorFragment("#vectors=%7Bbad")).toBeUndefined();
});
