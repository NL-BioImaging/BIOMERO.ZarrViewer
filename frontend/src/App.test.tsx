import { fireEvent, render, screen } from "@testing-library/react";
import { RenderModeToggle, ViewerPanel, VolumeControls } from "./App";
import type { ChannelState, VolumeLevel } from "./types";

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
