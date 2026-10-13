import { AppendOnlyStreamTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } from 'mediabunny';

let output: Output | undefined, source: CanvasSource | undefined, canvas: OffscreenCanvas | undefined;
let fps = 5, limit = 256 * 1024 * 1024, size = 0, chunks: Uint8Array<ArrayBuffer>[] = [];
const reply = (id: number, value: unknown, transfer: Transferable[] = []) => self.postMessage({ id, value }, { transfer });
self.onmessage = async event => {
  const { id, type, value } = event.data;
  try {
    if (type === 'start') {
      fps = value.fps; limit = value.maxBytes; size = 0; chunks = [];
      const width = value.width + value.width % 2, height = value.height + value.height % 2;
      if (!await canEncodeVideo('avc', { width, height, frameRate: fps })) throw new Error('Chrome cannot encode this MP4 size locally. Try a smaller crop.');
      canvas = new OffscreenCanvas(width, height);
      output = new Output({ format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
        target: new AppendOnlyStreamTarget(new WritableStream({ write(chunk) {
          size += chunk.byteLength;
          if (size > limit) throw new Error('Movie exceeds the configured size limit. Select fewer frames or a smaller crop.');
          chunks.push(chunk.slice());
        } })) });
      source = new CanvasSource(canvas, { codec: 'avc', quality: new Quality({ bitrate: 4_000_000 }) });
      output.addVideoTrack(source, { frameRate: fps });
      await output.start(); reply(id, true);
    } else if (type === 'frame') {
      if (!canvas || !source) throw new Error('Movie encoder is not ready.');
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.putImageData(new ImageData(new Uint8ClampedArray(value.data), value.width, value.height), 0, 0);
      await source.add(value.index / fps, 1 / fps); reply(id, true);
    } else if (type === 'finish') {
      if (!output) throw new Error('Movie encoder is not ready.');
      await output.finalize();
      const data = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      chunks = []; source?.close(); reply(id, data.buffer, [data.buffer]);
    } else if (type === 'cancel') {
      await output?.cancel(); chunks = []; reply(id, true);
    }
  } catch (error) {
    await output?.cancel().catch(() => {}); chunks = [];
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
