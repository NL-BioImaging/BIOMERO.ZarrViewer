import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ChannelColorPicker } from "./ChannelColorPicker";

test("named presets, grayscale, and custom colors update just the chosen color", () => {
  const changed = vi.fn();
  function Picker() {
    const [color, setColor] = useState("#123456");
    return <ChannelColorPicker name="DNA" color={color} onChange={value => { changed(value); setColor(value); }} />;
  }
  render(<Picker />);
  for (const [name, hex] of [["Red", "#FF0000"], ["Green", "#00FF00"], ["Blue", "#0000FF"], ["Cyan", "#00FFFF"], ["Magenta", "#FF00FF"], ["Yellow", "#FFFF00"], ["Grayscale", "#FFFFFF"]]) {
    fireEvent.click(screen.getByRole("button", { name: /^DNA color:/ }));
    fireEvent.click(screen.getByRole("button", { name }));
    expect(changed).toHaveBeenLastCalledWith(hex);
    expect(screen.queryByRole("group", { name: "DNA color presets" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `DNA color: ${name}` })).toHaveFocus();
  }
  fireEvent.click(screen.getByRole("button", { name: /^DNA color:/ }));
  fireEvent.change(screen.getByLabelText("DNA custom color"), { target: { value: "#abcdef" } });
  expect(changed).toHaveBeenLastCalledWith("#abcdef");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("button", { name: "DNA color: Custom" })).toHaveFocus();
});

test("outside clicks close the palette without applying a color", () => {
  const change = vi.fn();
  render(<ChannelColorPicker name="DNA" color="#00ff00" onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "DNA color: Green" }));
  expect(screen.getByRole("button", { name: "Green" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("group")).not.toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
