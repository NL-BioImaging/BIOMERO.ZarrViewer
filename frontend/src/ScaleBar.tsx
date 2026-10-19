import { scaleBarSize, unitLabel } from "./physical-scale";

export interface PanelScale { left: number; top: number; width: number; height: number; unitsPerPixel: number; perspective?: boolean }

/** Shared markup and styling for flat images, sections and volume panels. */
export function ScaleBar({ unitsPerPixel, unit, perspective = false }: { unitsPerPixel: number; unit: string; perspective?: boolean }) {
  if (!(unitsPerPixel > 0) || !Number.isFinite(unitsPerPixel)) return null;
  const bar = scaleBarSize(unitsPerPixel, 0);
  return <div className="physical-scale" aria-label={`Scale ${bar.value} ${unit}${perspective ? " at volume center" : ""}`}>
    <span style={{ width: `${bar.pixels}px` }} /><strong>{bar.value} {unitLabel(unit)}</strong>
    {perspective && <small>at volume center</small>}
  </div>;
}

export function PanelScaleBars({ panels, unit }: { panels: PanelScale[]; unit: string }) {
  return <>{panels.map((panel, index) => <div className="panel-scale-overlay" key={index}
    style={{ left: panel.left, top: panel.top, width: panel.width, height: panel.height }}>
    <ScaleBar unitsPerPixel={panel.unitsPerPixel} unit={unit} perspective={panel.perspective} />
  </div>)}</>;
}
