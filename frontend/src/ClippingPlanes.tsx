import type { CSSProperties } from 'react';
import type { ClippingBounds } from './clipping';

export function ClippingPlanes({bounds,onChange,shape=[100,100,100]}:{bounds:ClippingBounds;onChange:(bounds:ClippingBounds)=>void;shape?:number[]}) {
  const update=(axis:number,side:number,value:number)=>{
    const size=Math.max(1,shape[axis]),copy=bounds.map(range=>[...range]) as ClippingBounds;
    const position=(value-1)/Math.max(1,size-1);
    if(side===0)copy[axis][0]=Math.min(position,copy[axis][1]);
    else copy[axis][1]=Math.max(position,copy[axis][0]);
    onChange(copy);
  };
  return <details className="clipping-panel"><summary>Clipping planes</summary>
    {(['X','Y','Z'] as const).map((axis,i)=>{
      const size=Math.max(1,shape[i]),low=Math.min(size,Math.round(bounds[i][0]*(size-1))+1),high=Math.max(low,Math.round(bounds[i][1]*(size-1))+1);
      return <div key={axis} className="clipping-axis">
        <span>{axis}</span><div className="dual-range"><div className="range-track" style={{'--range-start':`${bounds[i][0]*100}%`,'--range-end':`${bounds[i][1]*100}%`,'--range-color':'#55bb66'} as CSSProperties}>
          <input type="range" min="1" max={size} step="1" aria-label={`${axis} clipping minimum`} aria-valuetext={`Slice ${low} of ${size}`} value={low} onChange={e=>update(i,0,Number(e.target.value))}/>
          <input type="range" min="1" max={size} step="1" aria-label={`${axis} clipping maximum`} aria-valuetext={`Slice ${high} of ${size}`} value={high} onChange={e=>update(i,1,Number(e.target.value))}/>
        </div><output title="Clipping plane positions at the selected quality (1-based)">{low}–{high} / {size}</output></div>
        <button type="button" className="icon-button" aria-label={`Reset ${axis} clipping`} title={`Reset ${axis} clipping`} onClick={()=>{const copy=bounds.map(range=>[...range]) as ClippingBounds;copy[i]=[0,1];onChange(copy);}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg></button>
      </div>;
    })}
  </details>;
}
