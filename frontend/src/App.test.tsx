import { fireEvent, render, screen } from "@testing-library/react";
import { FullscreenButton, focusedLabelStates, LabelPanel, RenderModeToggle, roiPngUrl, ViewerPanel, VolumeControls } from "./App";
import type { Capability, ChannelState, VolumeLevel } from "./types";

const channels: ChannelState[] = [{
  index: 0,
  label: "DNA",
  visible: true,
  color: "#00FF00",
  low: 10,
  high: 200,
  domainMin: 0,
  domainMax: 255,
}];

const levels: VolumeLevel[] = [{
  index: 2,
  width: 128,
  height: 128,
  depth: 16,
  rawBytes: 524288,
  safe: true,
}];

const capability: Capability = {
  schema_version: 1,
  supported: true,
  image: { id: 42, name: "Plate" },
  store: {
    url: "/data/",
    context: "signed",
    expires_at: "later",
    uuid: "3935615d-a18d-41d8-af04-e63cfec3a46c",
    roi_url: "/api/images/42/roi.png",
  },
  kind: "plate",
  ngff_version: "0.4",
  zarr_format: 2,
  initial_path: "A/1/0",
  axes: [{ name: "c" }, { name: "y" }, { name: "x" }],
  channels: [{ index: 0, label: "DNA", active: true }],
  labels: [{
    id: "label-0",
    name: "Cells",
    path: "A/1/0/labels/cells",
    axes: [{ name: "c" }, { name: "y" }, { name: "x" }],
    datasets: [{ path: "0" }],
  }],
  plate: {
    name: "Plate",
    rows: ["A"],
    columns: ["1"],
    acquisitions: [],
    wells: [{ path: "A/1", row_index: 0, column_index: 0, fields: [{ path: "A/1/0", name: "0" }] }],
    initial_path: "A/1/0",
  },
};

test("the 3D toggle is disabled when no safe level exists", () => {
  const onChange = vi.fn();
  render(<RenderModeToggle mode="2d" disabled3d onChange={onChange} />);
  expect(screen.getByRole("button", { name: "3D" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "2D" }));
  expect(onChange).toHaveBeenCalledWith("2d");
});

test("3D controls expose safe quality levels and the shared time point", () => {
  const onLevel = vi.fn();
  const onT = vi.fn();
  render(<VolumeControls sizeT={3} t={1} onT={onT} levels={levels} level={2} onLevel={onLevel} channelWarning="Channel limit reached" />);
  expect(screen.getByRole("combobox", { name: "3D volume quality" })).toHaveValue("2");
  expect(screen.getByText(/128×128×16/)).toBeInTheDocument();
  expect(screen.getByText("Channel limit reached")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
  expect(onT).toHaveBeenCalledWith(2);
});

test("segmentation labels are disabled while rendering intensity data in 3D", () => {
  render(<ViewerPanel
    capability={null}
    field="A/1/0"
    onField={() => {}}
    channels={channels}
    channelAnalyses={[]}
    onChannels={() => {}}
    labels={[{ id: "nuclei", name: "Nuclei", path: "labels/nuclei", visible: true, opacity: 0.3, mode: "fill" }]}
    onLabels={() => {}}
    sizeZ={16}
    sizeT={1}
    z={0}
    t={0}
    onZ={() => {}}
    onT={() => {}}
    projection="slice"
    onProjection={() => {}}
    renderMode="3d"
    volumeLevels={levels}
    volumeLevel={2}
    onVolumeLevel={() => {}}
    viewMode="field"
    onViewMode={() => {}}
    plateFieldIndex={0}
    onPlateFieldIndex={() => {}}
  />);
  expect(screen.getByRole("tab", { name: "Labels (1)" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "3D volume quality" })).toBeInTheDocument();
});

test("a stable label path focuses only the selected label value", () => {
  const labels = focusedLabelStates(capability, "A/1/0", {
    labelPath: "A/1/0/labels/cells",
    labelValue: 17,
  });
  expect(labels[0]).toMatchObject({
    visible: true,
    mode: "outline",
    opacity: 1,
    highlightValues: [17],
    outlineWidth: 2,
  });
});

test("ROI PNG URL uses one-based visible channels and store identity", () => {
  const url = new URL(roiPngUrl(capability, {
    field: "A/1/0",
    roi: { x0: 1, y0: 2, x1: 11, y1: 12 },
    labelPath: "A/1/0/labels/cells",
    labelValue: 17,
    z: 0,
    t: 0,
  }, channels)!);
  expect(url.searchParams.get("sourceChannels")).toBe("1");
  expect(url.searchParams.get("storeUuid")).toBe(capability.store.uuid);
  expect(url.searchParams.get("roi")).toBe("1,2,11,12");
});

test("label controls offer multicolor and the ordered monochrome palette", () => {
  const onChange = vi.fn();
  render(<LabelPanel labels={[{
    id: "cells",
    name: "Cells",
    path: "labels/cells",
    visible: true,
    opacity: 0.3,
    mode: "outline",
    outlineWidth: 2,
  }]} onChange={onChange} />);

  const colors = screen.getByRole("combobox", { name: "Cells color mode" });
  expect(Array.from(colors.querySelectorAll("option")).map((option) => option.textContent)).toEqual([
    "Multicolor", "Cyan", "Magenta", "Yellow", "Red", "Green", "Blue",
  ]);
  fireEvent.change(colors, { target: { value: "#00FFFF" } });
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ color: "#00FFFF" })]);
  fireEvent.change(colors, { target: { value: "" } });
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ color: undefined })]);

  const width = screen.getByRole("slider", { name: "Cells outline width" });
  expect(width).toHaveAttribute("max", "20");
  fireEvent.change(width, { target: { value: "20" } });
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ outlineWidth: 20 })]);
});

test("fullscreen control becomes an exit control while fullscreen is active", () => {
  const originalElement = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
  const originalRequest = document.documentElement.requestFullscreen;
  const originalExit = document.exitFullscreen;
  let fullscreenElement: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  document.documentElement.requestFullscreen = vi.fn(async () => {
    fullscreenElement = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  document.exitFullscreen = vi.fn(async () => {
    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });

  try {
    render(<FullscreenButton />);
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument();
  } finally {
    if (originalElement) Object.defineProperty(document, "fullscreenElement", originalElement);
    else delete (document as any).fullscreenElement;
    document.documentElement.requestFullscreen = originalRequest;
    document.exitFullscreen = originalExit;
  }
});
