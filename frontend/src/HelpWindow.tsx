import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import manual from "../../docs/viewer-guide.md?raw";

// The shared user guide uses headings, paragraphs, bullets and bold emphasis.
const sections = manual.split(/^## /m).slice(1).map((part, index) => {
  const [heading, ...body] = part.trim().split("\n");
  return { heading, body: body.join("\n").trim(), id: `viewer-help-${index}` };
});

function emphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith("**")
    ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
}

export function HelpWindow({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ x: Math.max(8, window.innerWidth - 924), y: 80 });
  const matching = sections.filter(section => `${section.heading}\n${section.body}`.toLowerCase().includes(query.trim().toLowerCase()));
  const clamp = useCallback((x: number, y: number) => ({
    x: Math.max(8, Math.min(x, window.innerWidth - (panel.current?.offsetWidth || 0) - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - (panel.current?.offsetHeight || 0) - 8)),
  }), []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    search.current?.focus();
    const resize = () => setPosition(current => clamp(current.x, current.y));
    const observer = new ResizeObserver(resize);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); previous?.focus(); };
  }, [clamp]);
  function startDrag(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  return <aside id="viewer-help" role="dialog" aria-modal="false" aria-label="ZarrViewer help"
    className="help-window" ref={panel} style={{ left: position.x, top: position.y }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <header className="help-window-titlebar" onPointerDown={startDrag}
      onPointerMove={event => { const origin = drag.current; if (origin) setPosition(clamp(origin.left + event.clientX - origin.x, origin.top + event.clientY - origin.y)); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <strong>ZarrViewer Help</strong>
      <button className="icon-button" aria-label="Close help" title="Close help" onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
      </button>
    </header>
    <div className="help-window-search">
      <input ref={search} type="search" aria-label="Search viewer help" placeholder="Search viewer features…" value={query} onChange={event => setQuery(event.target.value)} />
      <small>{matching.length} section{matching.length === 1 ? "" : "s"}</small>
    </div>
    <div className="help-window-layout">
      <nav aria-label="Help contents"><strong>Contents</strong>
        {matching.map(section => <button key={section.id} onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{section.heading}</button>)}
      </nav>
      <div className="help-window-content" tabIndex={0} aria-label="Viewer guide">
        {matching.map(section => <section id={section.id} key={section.id}>
          <h2>{section.heading}</h2>
          {section.body.split(/\n\s*\n/).map((block, i) => block.startsWith("- ")
            ? <ul key={i}>{block.split(/\n- /).map((line, j) => <li key={j}>{emphasis(line.replace(/^- /, "").replace(/\n/g, " "))}</li>)}</ul>
            : <p key={i}>{emphasis(block.replace(/\n/g, " "))}</p>)}
        </section>)}
        {!matching.length && <p>No viewer features match “{query}”.</p>}
      </div>
    </div>
  </aside>;
}

export function ViewerHelp() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <>
    <button className={`icon-button ${open ? "active" : ""}`} aria-label="Help" title="Help" aria-expanded={open} aria-controls={open ? "viewer-help" : undefined} onClick={() => setOpen(value => !value)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.5"/></svg>
    </button>
    {open && <HelpWindow onClose={close} />}
  </>;
}
