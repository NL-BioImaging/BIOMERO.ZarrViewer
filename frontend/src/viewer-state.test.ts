import { applyChannelDeepLink, applyLabelDeepLink, parseDeepLink, writeDeepLink } from "./viewer-state";
import type { ChannelState, LabelState } from "./types";

const channels: ChannelState[] = [{ index: 0, label: "DNA", visible: true, color: "#00FF00", low: 10, high: 200, domainMin: 0, domainMax: 255 }];
const labels: LabelState[] = [
  { id: "a", name: "Nuclei", path: "labels/a", visible: true, opacity: 0.5, mode: "fill" },
  { id: "b", name: "Cells", path: "labels/b", visible: false, opacity: 0.7, mode: "outline" },
];

beforeEach(() => window.history.replaceState(null, "", "/viewer/?image=42"));

test("deep-link state round trips", () => {
  const url = writeDeepLink(42, { viewport: { x: 12.25, y: 8.5, zoom: -1.25 }, z: 3, t: 2, projection: "mean", field: "A/1/0", channels, labels });
  const parsed = parseDeepLink(url.slice(url.indexOf("?")));
  expect(parsed.viewport).toEqual({ x: 12.25, y: 8.5, zoom: -1.25 });
  expect(parsed.field).toBe("A/1/0");
  expect(parsed.projection).toBe("mean");
  expect(parsed.channels?.[0]).toMatchObject({ index: 0, color: "#00FF00" });
  expect(parsed.labels?.[1]).toMatchObject({ id: "b", mode: "outline" });
});

test("invalid optional state is ignored and numeric state is clamped", () => {
  const parsed = parseDeepLink("?v=1&zoom=900&z=-3&projection=median&channels=not-json");
  expect(parsed.viewport?.zoom).toBe(30);
  expect(parsed.z).toBe(0);
  expect(parsed.channels).toBeUndefined();
  expect(parsed.projection).toBeUndefined();
});

test("saved channels are constrained to their domain", () => {
  const result = applyChannelDeepLink(channels, [{ index: 0, visible: false, color: "bad", low: -50, high: 999 }]);
  expect(result[0]).toMatchObject({ visible: false, color: "#00FF00", low: 0, high: 255 });
});

test("saved label order is restored without losing new layers", () => {
  const result = applyLabelDeepLink(labels, [{ id: "b", visible: true, opacity: 2, mode: "outline" }]);
  expect(result.map((item) => item.id)).toEqual(["b", "a"]);
  expect(result[0].opacity).toBe(1);
});
