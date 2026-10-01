import { useEffect, useRef, useState } from 'react';
import { DEFAULT_MOVIE_FPS, movieSequence, type MovieRecipe } from './movie-recipe';
import { exportMovie } from './movie-renderer';

export function TimePlayback({ sizeT, t, onT }: { sizeT: number; t: number; onT: (value: number) => void }) {
  const [playing, setPlaying] = useState(false), [fps, setFps] = useState(DEFAULT_MOVIE_FPS), [loop, setLoop] = useState(true);
  const current = useRef(t); current.current = t;
  useEffect(() => {
    setPlaying(false);
  }, [sizeT]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = current.current + 1;
      if (next >= sizeT && !loop) { setPlaying(false); return; }
      current.current = next % sizeT; onT(current.current);
    }, 1000 / fps);
    return () => clearInterval(timer);
  }, [playing, fps, sizeT, loop, onT]);
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

export function MovieExport({ imageId, sizeT, recipe }: { imageId: number; sizeT: number; recipe: MovieRecipe }) {
  const [open, setOpen] = useState(false), [start, setStart] = useState(1), [end, setEnd] = useState(Math.min(sizeT, 600));
  const [fps, setFps] = useState(DEFAULT_MOVIE_FPS), [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof exportMovie>>>();
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => { controller.current?.abort(); setStart(1); setEnd(Math.min(sizeT, 600)); setResult(undefined); }, [sizeT, recipe.panels[0].field]);
  useEffect(() => () => controller.current?.abort(), []);
  const [x0, y0, x1, y1] = recipe.panels[0].roi;
  const cropFits = x1 > x0 && y1 > y0 && x1 - x0 <= 2048 && y1 - y0 <= 2048;
  const stem = (recipe.filename || 'zarr-movie').replace(/[^A-Za-z0-9._-]/g, '-').replace(/\.mp4$/i, '');
  const run = async () => {
    setBusy(true); setResult(undefined); controller.current = new AbortController();
    try {
      const requested = { ...recipe, sequence: { version: 1 as const, start: start - 1, end: end - 1, fps } };
      movieSequence(requested, sizeT);
      setStatus('Preparing movie…');
      const movie = await exportMovie(imageId, requested, controller.current.signal, (done, total) => setStatus(`Creating frame ${done} of ${total}…`));
      setResult(movie); setStatus(`Movie ready · ${movie.provenance.frameCount} frames at ${fps} FPS`);
      download(`${stem}.mp4`, movie.data, 'video/mp4');
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <div className="movie-export">
    <button aria-expanded={open} onClick={() => setOpen(value => !value)}>Export movie</button>
    {open && <section aria-label="Export movie" className="movie-export-panel">
      <p>Export the visible area ({x1 - x0} ? {y1 - y0} pixels) and its visible layers. Playback speed is separate from acquisition timing. Maximum 600 frames, 2048 × 2048 pixels, 256 MiB.</p>
      <label>First frame <input type="number" min="1" max={sizeT} value={start} disabled={busy} onChange={event => setStart(Number(event.target.value))} /></label>
      <label>Last frame <input type="number" min="1" max={sizeT} value={end} disabled={busy} onChange={event => setEnd(Number(event.target.value))} /></label>
      <label>Frames per second <input type="number" min="1" max="60" value={fps} disabled={busy} onChange={event => setFps(Number(event.target.value))} /></label>
      {!cropFits && <p>Keep the image in view and zoom in to select an area of at most 2048 ? 2048 pixels.</p>}
      <button disabled={busy || !cropFits} onClick={() => void run()}>Create MP4</button>
      {busy && <button onClick={() => controller.current?.abort()}>Stop</button>}
      <p role="status">{status}</p>
      {result && <><button onClick={() => download(`${stem}.mp4`, result.data, 'video/mp4')}>Download MP4</button>
        <button onClick={() => download(`${stem}-recipe.json`, new TextEncoder().encode(JSON.stringify(result.provenance, null, 2)).buffer, 'application/json')}>Download recipe</button>
        <button onClick={() => download(`${stem}-poster.png`, result.poster, 'image/png')}>Download poster</button></>}
    </section>}
  </div>;
}
