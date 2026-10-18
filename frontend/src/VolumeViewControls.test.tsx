import { fireEvent, render, screen } from "@testing-library/react";
import { SliceControls, sliceIndex, volumeLayout } from "./VolumeViewControls";
import { vivVolumePanels } from "./viv-slices";

const source = { shape: [5, 20, 30], resolution: [300, 400, 1500], translation: [100, 200, 900], segmentation: false };

test("slice controls move voxel centers on the correct physical axis without moving other axes", () => {
  const position = vi.fn(), plane = vi.fn();
  const props = { source, camera: { position: [700, 1800, 4650], scale: 100, orientation: [0,0,0,1] }, onPosition: position, onPlane: plane };
  const { rerender } = render(<SliceControls {...props} view="slice" plane="xz" />);
  expect(screen.getByRole("slider", { name: "Y slice position" })).toHaveValue("4");
  fireEvent.change(screen.getByRole("slider"), { target: { value: "8" } });
  expect(position).toHaveBeenLastCalledWith([700, 3600, 4650]);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "yz" } });
  expect(plane).toHaveBeenCalledWith("yz");
  rerender(<SliceControls {...props} view="orthogonal" plane="xy" />);
  expect(screen.getAllByRole("slider")).toHaveLength(3);
  fireEvent.change(screen.getByRole("slider", { name: "Z slice position" }), { target: { value: "4" } });
  expect(position).toHaveBeenLastCalledWith([700, 1800, 7650]);
  rerender(<SliceControls {...props} view="3d" plane="xy" />);
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
});

test("edge positions clamp and native layouts map to the expected sections", () => {
  expect(sliceIndex(source, [-1e9, 1e9, 900], 0)).toBe(0);
  expect(sliceIndex(source, [-1e9, 1e9, 900], 1)).toBe(19);
  expect(volumeLayout("3d", "yz")).toBe("3d");
  expect(volumeLayout("slice", "yz")).toBe("yz");
  expect(volumeLayout("orthogonal", "xz")).toBe("4panel");
});

test("both engines use the same four-panel ordering", () => {
  const panels = vivVolumePanels("orthogonal", "xy", 800, 600);
  expect(panels.map(p => p.id)).toEqual(["xy","xz","3d","yz"]);
  expect(panels[3]).toEqual({ id:"yz", x:400, y:300, width:400, height:300 });
});
