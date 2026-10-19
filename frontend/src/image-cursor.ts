/** Cursor feedback follows the enabled navigation binding; it never handles input. */
export type ImageAction = 'zoom' | 'pan' | 'rotate' | 'slice' | 'depth' | 'select' | 'none';
export type ImageInteraction = 'viv-2d' | 'viv-volume' | 'neuroglancer';
export interface CursorInput {ctrlKey:boolean;altKey:boolean;metaKey:boolean;shiftKey:boolean;buttons:number;target:EventTarget|null}
export type BindingLookup = (identifier:string)=>string|undefined;
const empty = ():CursorInput=>({ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,buttons:0,target:null});

export function cursorBinding(input:CursorInput,event:string) {
  return 'at:'+([input.ctrlKey?'control':'',input.altKey?'alt':'',input.metaKey?'meta':'',input.shiftKey?'shift':'',event].filter(Boolean).join('+'));
}
function actionFor(binding:string|undefined):ImageAction {
  if(!binding)return 'none';
  if(binding.includes('zoom'))return 'zoom';
  if(binding.includes('depth-range')||binding.includes('depth-via'))return 'depth';
  if(binding.includes('slice-via')||/^z[+-]/.test(binding)||binding.startsWith('translate-z'))return 'slice';
  if(binding.includes('rotate'))return 'rotate';
  if(binding.includes('translate'))return 'pan';
  if(/select|annotat|move-to-mouse/.test(binding))return 'select';
  return 'none';
}
export function imageAction(kind:ImageInteraction,input:CursorInput,lookup?:BindingLookup):ImageAction {
  const modified=input.ctrlKey||input.altKey||input.metaKey||input.shiftKey;
  if(kind==='neuroglancer') {
    if(input.buttons){
      const button=input.buttons&1?0:input.buttons&2?2:1;
      return actionFor(lookup?.(cursorBinding(input,`mousedown${button}`)));
    }
    const wheel=actionFor(lookup?.(cursorBinding(input,'wheel')));
    if(wheel!=='zoom'||!modified)return wheel;
    const drag=actionFor(lookup?.(cursorBinding(input,'mousedown0')));
    return drag==='none'?'zoom':drag;
  }
  if(input.buttons){
    if(input.buttons&4)return 'none';
    if(kind==='viv-2d')return !modified&&Boolean(input.buttons&1)?'pan':'none';
    return modified||Boolean(input.buttons&2)?'pan':'rotate';
  }
  return kind==='viv-volume'&&modified?'pan':'zoom';
}
const paths:Record<string,string>={
  zoom:'<circle cx="11" cy="11" r="7"/><path d="m16 16 8 8M8 11h6m-3-3v6"/>',
  rotate:'<path d="M7 8a9 9 0 1 1-1 12M3 3v7h7m15 15v-7h-7"/>',
  slice:'<path d="m4 12 10-5 10 5-10 5-10-5Zm0 6 10 5 10-5M14 2v3m0 21v3"/>',
  depth:'<path d="M5 8h14M5 14h14M5 20h14m6-16v22m-3-3 3 3 3-3m-6-16 3-3 3 3"/>',
};
const icons=Object.fromEntries(Object.entries(paths).map(([key,path])=>{
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke="black" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${path}</g><g fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</g></svg>`;
  return [key,`url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, ${key==='zoom'?'zoom-in':'move'}`];
}));
export function imageCursor(action:ImageAction,pressed=false) {
  if(action==='pan')return pressed?'grabbing':'grab';
  if(action==='select')return 'crosshair';
  if(action==='none')return pressed?'not-allowed':'default';
  return icons[action];
}

export function installImageCursor(host:HTMLElement,resolve:(input:CursorInput)=>ImageAction) {
  let input=empty(),active:ImageAction|undefined,inside=false;
  const previous=host.style.getPropertyValue('--image-cursor');
  const render=()=>{
    const action=active??resolve(input);
    host.style.setProperty('--image-cursor',imageCursor(action,Boolean(input.buttons)));
    host.dataset.imageAction=action;
  };
  const modifiers=(event:Pick<CursorInput,'ctrlKey'|'altKey'|'metaKey'|'shiftKey'>)=>{
    input={...input,ctrlKey:Boolean(event.ctrlKey),altKey:Boolean(event.altKey),metaKey:Boolean(event.metaKey),shiftKey:Boolean(event.shiftKey)};
  };
  const pointer=(event:PointerEvent)=>{
    inside=true;modifiers(event);input={...input,buttons:event.buttons,target:event.target};render();
  };
  const down=(event:PointerEvent)=>{pointer(event);active=resolve(input);render();};
  const up=(event:PointerEvent)=>{input={...input,buttons:event.buttons};if(!event.buttons)active=undefined;modifiers(event);render();};
  const leave=()=>{inside=false;if(!input.buttons)active=undefined;};
  const key=(event:KeyboardEvent)=>{modifiers(event);if(inside)render();};
  const reset=()=>{input={...empty(),target:input.target};active=undefined;render();};
  const doc=host.ownerDocument,win=doc.defaultView!;
  host.addEventListener('pointerenter',pointer);host.addEventListener('pointermove',pointer);host.addEventListener('pointerdown',down,true);host.addEventListener('pointerleave',leave);
  win.addEventListener('pointerup',up,true);win.addEventListener('pointercancel',reset);win.addEventListener('blur',reset);
  win.addEventListener('keydown',key,true);win.addEventListener('keyup',key,true);render();
  return {
    setModifiers(event:Pick<CursorInput,'ctrlKey'|'altKey'|'metaKey'|'shiftKey'>){modifiers(event);if(inside)render();},
    dispose(){
      host.removeEventListener('pointerenter',pointer);host.removeEventListener('pointermove',pointer);host.removeEventListener('pointerdown',down,true);host.removeEventListener('pointerleave',leave);
      win.removeEventListener('pointerup',up,true);win.removeEventListener('pointercancel',reset);win.removeEventListener('blur',reset);
      win.removeEventListener('keydown',key,true);win.removeEventListener('keyup',key,true);
      if(previous)host.style.setProperty('--image-cursor',previous);else host.style.removeProperty('--image-cursor');delete host.dataset.imageAction;
    }
  };
}
