/** Select enough pixels for the displayed preview, with a bounded raster size. */
export function previewLevel(loader: any[], targetPixels: number, fullResolution = false): number {
  const target = Math.max(32, Math.min(2048, targetPixels));
  const size = (source: any) => {
    const labels: string[] = source.labels || [];
    return Math.max(Number(source.shape[labels.indexOf("x")]) || 1, Number(source.shape[labels.indexOf("y")]) || 1);
  };
  if (fullResolution && size(loader[0]) <= 2048) return 0;
  let level = 0;
  for (let index = 0; index < loader.length; index++) {
    if (size(loader[index]) >= target / 1.25) level = index;
  }
  while (level < loader.length - 1 && size(loader[level]) > 2048) level++;
  return level;
}

/** Bound field jobs so plate overviews do not flood the authenticated gateway. */
export function createPreviewQueue(limit = 4) {
  let active = 0;
  const pending: Array<() => void> = [];
  return async <T,>(work: () => Promise<T>, priority = false): Promise<T> => {
    await new Promise<void>((resolve) => {
      const start = () => { active++; resolve(); };
      if (active < limit) start(); else if (priority) pending.unshift(start); else pending.push(start);
    });
    try { return await work(); }
    finally { active--; pending.shift()?.(); }
  };
}

export const queuePreview = createPreviewQueue();
