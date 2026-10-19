import { movieSequence, type MovieRecipe } from './movie-recipe';
import { encodePreparedMovie } from './movie-renderer';
import { abortableDelay } from './shared-request';
import { viewerContextId } from './viewer-context';

export async function captureNeuroglancer(frame:HTMLIFrameElement, signal:AbortSignal):Promise<ImageData> {
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const id=viewerContextId();
    const finish=(error?:Error,value?:ImageData)=>{
      clearTimeout(timer);signal.removeEventListener('abort',abort);window.removeEventListener('message',receive);
      if(error)reject(error);else resolve(value!);
    };
    const abort=()=>finish(new DOMException('Movie export stopped.','AbortError'));
    const receive=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='biomero-ng-capture'||event.data.id!==id)return;
      const {width,height,data,error}=event.data;
      if(error)return finish(new Error(error));
      if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>16_000_000||!(data instanceof ArrayBuffer)||data.byteLength!==width*height*4)
        return finish(new Error('The 3D renderer returned an invalid frame.'));
      finish(undefined,new ImageData(new Uint8ClampedArray(data),width,height));
    };
    const timer=setTimeout(()=>finish(new Error('The 3D renderer did not finish the movie frame.')),30_000);
    signal.addEventListener('abort',abort,{once:true});window.addEventListener('message',receive);
    frame.contentWindow?.postMessage({type:'biomero-ng-capture',id},location.origin);
  });
}

/** Composite only the image canvases and scientific overlays, not the sidebar. */
export async function captureVolumeView(host:HTMLElement, canvas:OffscreenCanvas, background:string, signal:AbortSignal) {
  signal.throwIfAborted();
  const bounds=host.getBoundingClientRect(),context=canvas.getContext('2d')!;
  const sx=canvas.width/bounds.width,sy=canvas.height/bounds.height;
  context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);
  const sources=[...host.querySelectorAll<HTMLCanvasElement|HTMLIFrameElement>('canvas, iframe.neuroglancer-frame')].filter(el=>{
    const box=el.getBoundingClientRect();return box.width>0&&box.height>0;
  });
  if(!sources.length)throw new Error('The 3D image is not ready for export.');
  for(const source of sources){
    signal.throwIfAborted();const box=source.getBoundingClientRect();
    let image:CanvasImageSource=source as HTMLCanvasElement;
    if(source instanceof HTMLIFrameElement){
      const pixels=await captureNeuroglancer(source,signal),temp=new OffscreenCanvas(pixels.width,pixels.height);
      temp.getContext('2d')!.putImageData(pixels,0,0);image=temp;
    }
    context.drawImage(image,(box.left-bounds.left)*sx,(box.top-bounds.top)*sy,box.width*sx,box.height*sy);
  }
  context.save();context.scale(sx,sy);context.translate(-bounds.left,-bounds.top);
  context.strokeStyle='#fff';context.fillStyle='#fff';context.lineWidth=2;context.font='12px sans-serif';
  for(const bar of host.querySelectorAll<HTMLElement>('.physical-scale')){
    const line=bar.querySelector('span')?.getBoundingClientRect(),text=bar.querySelector('strong'),box=text?.getBoundingClientRect();
    if(line&&box){context.beginPath();context.moveTo(line.left,line.top+line.height/2);context.lineTo(line.right,line.top+line.height/2);context.stroke();context.fillText(text!.textContent||'',box.left,box.bottom-2);}
    const note=bar.querySelector('small');
    if(note){const box=note.getBoundingClientRect();context.font='10px sans-serif';context.fillText(note.textContent||'',box.left,box.bottom-2);context.font='12px sans-serif';}
  }
  for(const label of host.querySelectorAll<HTMLElement>('.orthogonal-panel-labels span')){
    const box=label.getBoundingClientRect();context.fillText(label.textContent||'',box.left+5,box.top+14);
  }
  for(const svg of host.querySelectorAll<SVGSVGElement>('svg.section-crosshair')){
    const box=svg.getBoundingClientRect();context.save();context.translate(box.left,box.top);
    const coordinate=(value:string|null,extent:number)=>value?.endsWith('%')?parseFloat(value)*extent/100:Number(value||0);
    for(const line of svg.querySelectorAll('line')){
      context.strokeStyle=line.getAttribute('stroke')||'#fff';context.lineWidth=1;context.beginPath();
      context.moveTo(coordinate(line.getAttribute('x1'),box.width),coordinate(line.getAttribute('y1'),box.height));
      context.lineTo(coordinate(line.getAttribute('x2'),box.width),coordinate(line.getAttribute('y2'),box.height));context.stroke();
    }
    context.restore();
  }
  context.restore();signal.throwIfAborted();return context.getImageData(0,0,canvas.width,canvas.height);
}

export async function exportVolumeMovie(imageId:number,recipe:MovieRecipe,sizeT:number,host:HTMLElement,
  loadFrame:(t:number,signal:AbortSignal)=>Promise<void>,signal:AbortSignal,progress:(done:number,total:number)=>void){
  if(!recipe.viewCapture)throw new Error('Choose a 3D view for this movie.');
  // Native-pixel channel/crop restrictions belong to the 2D raster exporter.
  // The rendered view is already bounded and may composite more channels.
  const sequence=movieSequence({...recipe,panels:[{...recipe.panels[0],sourceChannels:[1],overlays:[]}]},sizeT);
  const bounds=host.getBoundingClientRect(),canvas=new OffscreenCanvas(sequence.width,sequence.height);
  const prepared={sequence,canvas,frame:async(t:number)=>{
    await loadFrame(t,signal);signal.throwIfAborted();
    const current=host.getBoundingClientRect();
    if(current.width!==bounds.width||current.height!==bounds.height)throw new Error('The viewer was resized. Create the movie again.');
    return captureVolumeView(host,canvas,String(recipe.viewCapture!.settings.background||'#030406'),signal);
  },provenance:{application:'biomero-zarr-viewer',rendererVersion:'browser-volume-movie-v1',omeroImageId:imageId,
    createdAt:new Date().toISOString(),frameCount:sequence.frames,fps:sequence.fps,width:sequence.width,height:sequence.height,
    encodedWidth:sequence.width+sequence.width%2,encodedHeight:sequence.height+sequence.height%2,
    acquisitionTiming:'Source metadata; playback FPS is independent.',recipe}};
  return encodePreparedMovie(prepared,recipe.sequence.start,signal,progress);
}

export async function waitForVolumeFrame(ready:()=>boolean,signal:AbortSignal,timeoutMs=120_000){
  const deadline=Date.now()+timeoutMs;
  while(!ready()){
    signal.throwIfAborted();if(Date.now()>deadline)throw new Error('The 3D frame did not finish loading. Try a lower quality.');
    await abortableDelay(50,signal);
  }
  signal.throwIfAborted();
}
