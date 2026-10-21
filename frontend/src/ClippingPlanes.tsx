import type { CSSProperties } from 'react';
import type { ClippingBounds } from './clipping';

export function ClippingPlanes({bounds,onChange}:{bounds:ClippingBounds;onChange:(bounds:ClippingBounds)=>void}) {
  const update=(axis:number,side:number,value:number)=>{
    const copy=bounds.map(range=>[...range]) as ClippingBounds;
    copy[axis][side]=side===0?Math.min(value,copy[axis][1]):Math.max(value,copy[axis][0]);onChange(copy);
  };
  return <details className="clipping-panel"><summary>Clipping planes</summary>
    {(['X','Y','Z'] as const).map((axis,i)=><div key={axis} className="clipping-axis">
      <span>{axis}</span><div className="dual-range"><div className="range-track" style={{'--range-start':`${bounds[i][0]*100}%`,'--range-end':`${bounds[i][1]*100}%`,'--range-color':'#55bb66'} as CSSProperties}>
        <input type="range" min="0" max="100" step="1" aria-label={`${axis} clipping minimum`} value={bounds[i][0]*100} onChange={e=>update(i,0,Number(e.target.value)/100)}/>
        <input type="range" min="0" max="100" step="1" aria-label={`${axis} clipping maximum`} value={bounds[i][1]*100} onChange={e=>update(i,1,Number(e.target.value)/100)}/>
      </div><output>{Math.round(bounds[i][0]*100)}–{Math.round(bounds[i][1]*100)}%</output></div>
      <button type="button" className="icon-button" aria-label={`Reset ${axis} clipping`} title={`Reset ${axis} clipping`} onClick={()=>{const copy=bounds.map(range=>[...range]) as ClippingBounds;copy[i]=[0,1];onChange(copy);}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg></button>
    </div>)}
  </details>;
}
