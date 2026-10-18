import { useEffect, useId, useRef, useState } from "react";

export const channelColors = [
  ["Red", "#FF0000"], ["Green", "#00FF00"], ["Blue", "#0000FF"],
  ["Cyan", "#00FFFF"], ["Magenta", "#FF00FF"], ["Yellow", "#FFFF00"],
  ["Grayscale", "#FFFFFF"],
] as const;

export function ChannelColorPicker({ name, color, onChange }: { name: string; color: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = channelColors.find(([, value]) => value === color.toUpperCase())?.[0] || "Custom";
  useEffect(() => {
    if (!open) return;
    (root.current?.querySelector<HTMLButtonElement>(".color-preset[aria-pressed='true']")
      || root.current?.querySelector<HTMLButtonElement>(".color-preset"))?.focus();
    root.current?.querySelector(".channel-color-popover")?.scrollIntoView?.({ block: "nearest" });
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="channel-color-picker" ref={root} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button ref={trigger} className="channel-color-trigger" aria-label={`${name} color: ${selected}`} title={`Change ${name} color`}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <span style={{ background: color }} /><span aria-hidden="true">▾</span>
    </button>
    {open && <div className="channel-color-popover" id={id} role="group" aria-label={`${name} color presets`}>
      <div className="color-presets">{channelColors.map(([label, value]) => <button key={label} className="color-preset"
        aria-label={label} aria-pressed={color.toUpperCase() === value} onClick={() => { onChange(value); setOpen(false); trigger.current?.focus(); }}>
        <span style={{ background: label === "Grayscale" ? "linear-gradient(90deg, #000, #fff)" : value }} />{label}
      </button>)}</div>
      <label className="custom-channel-color">Custom color<input type="color" aria-label={`${name} custom color`} value={color}
        onChange={event => onChange(event.target.value)} /></label>
    </div>}
  </div>;
}
