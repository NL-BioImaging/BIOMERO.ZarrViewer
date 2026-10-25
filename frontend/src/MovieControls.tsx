import { useEffect, useRef, useState } from 'react';
import { DEFAULT_MOVIE_FPS, MAX_MOVIE_FRAMES, movieSequence, type MovieRecipe } from './movie-recipe';
import { exportMovie, type MovieResult } from './movie-renderer';

export function TimePlayback({ sizeT, t, onT, ready=true, playing: controlledPlaying, onPlayingChange }: { sizeT: number; t: number; onT: (value: number) => void; ready?:boolean; playing?:boolean; onPlayingChange?:(value:boolean)=>void }) {
  const [internalPlaying, setInternalPlaying] = useState(false), [fps, setFps] = useState(DEFAULT_MOVIE_FPS), [loop, setLoop] = useState(true);
  const playing=controlledPlaying??internalPlaying;
  const setPlaying=(next:boolean|((value:boolean)=>boolean))=>{
    const value=typeof next==='function'?next(playing):next;
    if(controlledPlaying===undefined)setInternalPlaying(value);
    onPlayingChange?.(value);
  };
  const current = useRef(t); current.current = t;
  useEffect(() => {
    setPlaying(false);
  }, [sizeT]);
  useEffect(() => {
    if (!playing || !ready) return;
    const timer = setTimeout(() => {
      const next = current.current + 1;
      if (next >= sizeT && !loop) { setPlaying(false); return; }
      current.current = next % sizeT; onT(current.current);
    }, 1000 / fps);
    return () => clearTimeout(timer);
  }, [playing, fps, sizeT, loop, onT, t, ready]);
  if (sizeT <= 1) return null;
  return <div className="time-playback" role="group" aria-label="Time playback">
    <button aria-label="Previous frame" disabled={t === 0} onClick={() => { setPlaying(false); onT(t - 1); }}>◀</button>
    <button onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play'}</button>
    <button aria-label="Next frame" disabled={t >= sizeT - 1} onClick={() => { setPlaying(false); onT(t + 1); }}>▶</button>
    <label>FPS <input aria-label="Playback frames per second" type="number" min="1" max="60" value={fps}
      onChange={event => setFps(Math.max(1, Math.min(60, Number(event.target.value) || DEFAULT_MOVIE_FPS)))} /></label>
    <label><input type="checkbox" checked={loop} onChange={event => setLoop(event.target.checked)} />Loop</label>
  </div>;
}

function download(name: string, data: ArrayBuffer, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type })), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MovieExport({ imageId, sizeT, recipe, exporter, onBusy }: { imageId: number; sizeT: number; recipe: MovieRecipe;
  exporter?: (recipe:MovieRecipe,signal:AbortSignal,progress:(done:number,total:number)=>void)=>Promise<MovieResult>; onBusy?:(busy:boolean)=>void }) {
  const [open, setOpen] = useState(false), [start, setStart] = useState(1), [end, setEnd] = useState(Math.min(sizeT, MAX_MOVIE_FRAMES));
  const [fps, setFps] = useState(DEFAULT_MOVIE_FPS), [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const [cancelling,setCancelling]=useState(false);
  const [result, setResult] = useState<MovieResult>();
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => { controller.current?.abort(); setStart(1); setEnd(Math.min(sizeT, MAX_MOVIE_FRAMES)); setResult(undefined); }, [sizeT, recipe.panels[0].field]);
  useEffect(() => () => controller.current?.abort(), []);
  const [x0, y0, x1, y1] = recipe.panels[0].roi;
  const cropFits = x1 > x0 && y1 > y0 && x1 - x0 <= 2048 && y1 - y0 <= 2048;
  const stem = (recipe.filename || 'zarr-movie').replace(/[^A-Za-z0-9._-]/g, '-').replace(/\.mp4$/i, '');
  const run = async () => {
    const active=new AbortController();controller.current=active;
    setBusy(true); setCancelling(false); onBusy?.(true); setResult(undefined);
    try {
      const requested = { ...recipe, sequence: { version: 1 as const, start: start - 1, end: end - 1, fps } };
      if (!exporter) movieSequence(requested, sizeT);
      setStatus('Preparing movie…');
      const progress=(done:number,total:number)=>{if(!active.signal.aborted)setStatus(`Creating frame ${done} of ${total}…`);};
      const movie = await (exporter ? exporter(requested, active.signal, progress)
        : exportMovie(imageId, requested, active.signal, progress));
      active.signal.throwIfAborted();
      setResult(movie); setStatus(`Movie ready · ${movie.provenance.frameCount} frames at ${fps} FPS`);
      download(`${stem}.mp4`, movie.data, 'video/mp4');
    } catch (error) { setStatus(active.signal.aborted ? 'Movie export cancelled.' : error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); setCancelling(false); onBusy?.(false); if(controller.current===active)controller.current=undefined; }
  };
  const cancel=()=>{setCancelling(true);setStatus('Cancelling movie export…');controller.current?.abort();};
  return <div className="movie-export">
    <div className="movie-export-actions">
      <button type="button" className={`icon-button ${open?'active':''}`} aria-label="Export movie" title="Export movie" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="14" height="16" rx="2"/><path d="M7 3v16M13 3v8M3 7h14M3 15h10M18 13v8m-3-3 3 3 3-3"/></svg>
      </button>
      {busy && <button type="button" aria-label="Cancel movie export" title="Cancel movie export" disabled={cancelling} onClick={cancel}>{cancelling?'Cancelling…':'Cancel'}</button>}
    </div>
    {open && <section aria-label="Export movie" className="movie-export-panel">
      <p>{exporter ? 'Export the rendered 3D view at the current screen resolution, with its camera and visible layers held fixed.' : `Export the visible area (${x1 - x0} × ${y1 - y0} pixels) and its visible layers.`} Playback speed is separate from acquisition timing. Maximum {MAX_MOVIE_FRAMES} frames, 2048 × 2048 pixels, 256 MiB.</p>
      <label>First frame <input type="number" min="1" max={sizeT} value={start} disabled={busy} onChange={event => setStart(Number(event.target.value))} /></label>
      <label>Last frame <input type="number" min="1" max={sizeT} value={end} disabled={busy} onChange={event => setEnd(Number(event.target.value))} /></label>
      <label>Frames per second <input type="number" min="1" max="60" value={fps} disabled={busy} onChange={event => setFps(Number(event.target.value))} /></label>
      {!cropFits && <p>Keep the image in view and zoom in to select an area of at most 2048 × 2048 pixels.</p>}
      <button disabled={busy || !cropFits} onClick={() => void run()}>Create MP4</button>
      <p role="status">{status}</p>
      {result && <><button onClick={() => download(`${stem}.mp4`, result.data, 'video/mp4')}>Download MP4</button>
        <button onClick={() => download(`${stem}-recipe.json`, new TextEncoder().encode(JSON.stringify(result.provenance, null, 2)).buffer, 'application/json')}>Download recipe</button>
        <button onClick={() => download(`${stem}-poster.png`, result.poster, 'image/png')}>Download poster</button></>}
    </section>}
  </div>;
}
