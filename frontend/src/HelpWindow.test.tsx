import { fireEvent, render, screen } from "@testing-library/react";
import { ViewerHelp } from "./HelpWindow";

test("help searches viewer features and returns focus when closed with Escape", () => {
  const resizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as any;
  try {
    render(<ViewerHelp />);
    const button = screen.getByRole("button", { name: "Help" });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "ZarrViewer help" })).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search viewer help" });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: "Ctrl+wheel" } });
    expect(screen.getByRole("heading", { name: "Move around in 3D" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Open an image" })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "does-not-exist" } });
    expect(screen.getByText(/No viewer features match/)).toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
  } finally { globalThis.ResizeObserver = resizeObserver; }
});
