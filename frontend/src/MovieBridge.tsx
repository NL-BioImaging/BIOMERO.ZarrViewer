import { useEffect } from 'react';
import { selectedImageId } from './api';
import { exportMovie } from './movie-renderer';
import type { MovieRecipe } from './movie-recipe';

/** Same-origin parent owns the session; credentials and source pixels stay inside ZarrViewer. */
export function MovieBridge() {
  useEffect(() => {
    const nonce = new URLSearchParams(location.search).get('nonce');
    const imageId = selectedImageId();
    let controller: AbortController | undefined;
    const send = (type: string, value?: unknown, transfer: Transferable[] = []) => {
      window.parent.postMessage({ source: 'zarr-movie', nonce, type, value }, location.origin, transfer);
    };
    const receive = async (event: MessageEvent) => {
      if (!nonce || !imageId || event.origin !== location.origin || event.source !== window.parent ||
          event.data?.source !== 'analysis-movie' || event.data.nonce !== nonce) return;
      if (event.data.type === 'cancel') { controller?.abort(); return; }
      if (event.data.type !== 'render' || controller) return;
      controller = new AbortController();
      try {
        const result = await exportMovie(imageId, event.data.recipe as MovieRecipe, controller.signal,
          (completed, total) => send('progress', { completed, total }));
        send('complete', result, [result.data, result.poster]);
      } catch (error) { send('error', error instanceof Error ? error.message : String(error)); }
    };
    window.addEventListener('message', receive); send('ready');
    return () => { controller?.abort(); window.removeEventListener('message', receive); };
  }, []);
  return <p role="status">Preparing movie…</p>;
}
