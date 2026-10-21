import { useEffect, useState } from 'react';

export const MIB = 1024 * 1024;
const STORAGE_KEY = 'biomero-zarr-viewer.max-vram-mib';
export type MemoryChoice = '100' | '200' | '500' | 'auto';
const validChoice = (value:unknown):value is MemoryChoice => ['100','200','500','auto'].includes(String(value));

/** Application calibration, not detected VRAM: 1 GiB at 1920x1080 device pixels.
 * MDN's per-pixel heuristic is bounded here to 128 MiB..4 GiB. A larger window
 * does not prove that more GPU memory exists or is available to this browser.
 */
export function estimateVramMiB(width:number,height:number,dpr:number):number {
  const pixels = width * height * dpr * dpr;
  return Number.isFinite(pixels) && width>0 && height>0 && dpr>0
    ? Math.round(Math.max(128,Math.min(4096,1024*pixels/(1920*1080)))) : 1024;
}
export function memoryOptions(estimate:number) {
  const automatic = Math.max(10,Math.floor(estimate*.75/10)*10);
  return [
    {value:'100' as const,mib:100,label:'100 MiB'},
    {value:'200' as const,mib:200,label:'200 MiB'},
    ...(automatic>500?[{value:'500' as const,mib:500,label:'500 MiB'}]:[]),
    {value:'auto' as const,mib:automatic,label:`${automatic} MiB (75%)`},
  ];
}
function readChoice():MemoryChoice {
  try {const value=localStorage.getItem(STORAGE_KEY);if(validChoice(value))return value;}catch { /* Storage can be disabled. */ }
  return '200';
}
export function useVolumeMemory() {
  const measure=()=>estimateVramMiB(window.innerWidth,window.innerHeight,window.devicePixelRatio||1);
  const [estimate,setEstimate]=useState(measure);
  const [preference,setPreference]=useState<MemoryChoice>(readChoice);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const resize=()=>{clearTimeout(timer);timer=setTimeout(()=>setEstimate(measure()),150);};
    window.addEventListener('resize',resize);
    return ()=>{clearTimeout(timer);window.removeEventListener('resize',resize);};
  },[]);
  const options=memoryOptions(estimate);
  const choice=options.find(option=>option.value===preference)||options[1];
  const change=(value:MemoryChoice)=>{
    if(!validChoice(value))return;
    setPreference(value);
    try {localStorage.setItem(STORAGE_KEY,value);}catch { /* The current tab still works. */ }
  };
  return {estimate,options,choice,budgetBytes:choice.mib*MIB,change};
}
export function VolumeMemoryControls({memory}:{memory:ReturnType<typeof useVolumeMemory>}) {
  return <div className="volume-memory-controls">
    <p className="memory-estimate" title="Per-pixel estimate: 1 GiB at 1920×1080 device pixels; scaled to this window, bounded to 128 MiB–4 GiB. Not a measurement of total or free GPU memory.">
      Estimated VRAM budget: <strong>{memory.estimate} MiB</strong>
      <small>Window-based estimate; available GPU memory is unknown.</small>
    </p>
    <label className="quality-control"><span>Max VRAM memory</span>
      <select aria-label="Max VRAM memory" value={memory.choice.value} onChange={event=>memory.change(event.target.value as MemoryChoice)}>
        {memory.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  </div>;
}
