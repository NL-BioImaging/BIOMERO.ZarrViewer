import { useEffect, useState } from 'react';

export const MIB = 1024 * 1024;
const STORAGE_KEY = 'biomero-zarr-viewer.max-vram-mib';
const GPU_STORAGE_KEY = 'biomero-zarr-viewer.gpu-vram-gib';
export const GPU_VRAM_GIB = [2,4,8,12,16,24,48] as const;
export type GpuChoice = 'estimate' | `${typeof GPU_VRAM_GIB[number]}`;
const validGpuChoice = (value:unknown):value is GpuChoice => value==='estimate' || GPU_VRAM_GIB.some(gib=>String(gib)===value);
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
export function memoryOptions(estimate:number,manual=false) {
  const automatic = Math.max(10,manual?Math.floor(estimate*.75):Math.floor(estimate*.75/10)*10);
  const automaticLabel = automatic%1024===0 ? `${automatic/1024} GiB` : `${automatic} MiB`;
  return [
    {value:'100' as const,mib:100,label:'100 MiB'},
    {value:'200' as const,mib:200,label:'200 MiB'},
    ...(automatic>500?[{value:'500' as const,mib:500,label:'500 MiB'}]:[]),
    {value:'auto' as const,mib:automatic,label:`${automaticLabel} (75%)`},
  ];
}
function readChoice():MemoryChoice {
  try {const value=localStorage.getItem(STORAGE_KEY);if(validChoice(value))return value;}catch { /* Storage can be disabled. */ }
  return '200';
}
function readGpuChoice():GpuChoice {
  try {const value=localStorage.getItem(GPU_STORAGE_KEY);if(validGpuChoice(value))return value;}catch { /* Storage can be disabled. */ }
  return 'estimate';
}
export function useVolumeMemory() {
  const measure=()=>estimateVramMiB(window.innerWidth,window.innerHeight,window.devicePixelRatio||1);
  const [estimate,setEstimate]=useState(measure);
  const [preference,setPreference]=useState<MemoryChoice>(readChoice);
  const [gpuChoice,setGpuChoice]=useState<GpuChoice>(readGpuChoice);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const resize=()=>{clearTimeout(timer);timer=setTimeout(()=>setEstimate(measure()),150);};
    window.addEventListener('resize',resize);
    return ()=>{clearTimeout(timer);window.removeEventListener('resize',resize);};
  },[]);
  const options=memoryOptions(gpuChoice==='estimate'?estimate:Number(gpuChoice)*1024,gpuChoice!=='estimate');
  const choice=options.find(option=>option.value===preference)||options[1];
  const change=(value:MemoryChoice)=>{
    if(!validChoice(value))return;
    setPreference(value);
    try {localStorage.setItem(STORAGE_KEY,value);}catch { /* The current tab still works. */ }
  };
  const changeGpu=(value:GpuChoice)=>{
    if(!validGpuChoice(value))return;
    setGpuChoice(value);
    try {localStorage.setItem(GPU_STORAGE_KEY,value);}catch { /* The current tab still works. */ }
  };
  return {estimate,options,choice,gpuChoice,budgetBytes:choice.mib*MIB,change,changeGpu};
}
export function VolumeMemoryControls({memory}:{memory:ReturnType<typeof useVolumeMemory>}) {
  return <div className="volume-memory-controls">
    <label htmlFor="max-vram">Max VRAM</label>
      <select id="max-vram" aria-label="Max VRAM" value={memory.choice.value} onChange={event=>memory.change(event.target.value as MemoryChoice)}>
        {memory.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    <select aria-label="GPU VRAM" title="GPU VRAM used for the 75% option" value={memory.gpuChoice} onChange={event=>memory.changeGpu(event.target.value as GpuChoice)}>
      <option value="estimate">Estimate ({Number((memory.estimate/1024).toFixed(2))} GiB)</option>
      {GPU_VRAM_GIB.map(gib=><option key={gib} value={String(gib)}>{gib} GiB</option>)}
    </select>
  </div>;
}
