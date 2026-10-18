import { unitLabel } from "./physical-scale";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

export interface MetadataPayload {
  zarr: {format:number;ngff_version:string;kind:string;nodes:Array<{path:string;attributes:Record<string,any>;array?:Record<string,any>|null;documents:Record<string,any>}>;notices:string[]};
  omero: Record<string,any>;
}
type Section = { id:string; title:string; value:unknown };
const join = (...parts:string[]) => parts.filter(part=>part && part!==".").join("/") || ".";
const ome = (attrs:Record<string,any>) => ({...attrs,...(attrs.ome || {})});

export function metadataSections(data:MetadataPayload, field:string): Section[] {
  const nodes=data.zarr.nodes, image=nodes.find(node=>node.path===(field||".")) || nodes[0];
  const attrs=ome(image?.attributes || {}), multiscale=attrs.multiscales?.[0];
  const datasets=multiscale?.datasets || [], axes=(multiscale?.axes || []).map((axis:any)=>typeof axis==="string"?{name:axis}:axis);
  const first=nodes.find(node=>node.path===join(image?.path || ".",datasets[0]?.path || "0"))?.array;
  const scale=axes.map(()=>1), origin=axes.map(()=>0);
  for (const transform of [...(datasets[0]?.coordinateTransformations || []),...(multiscale?.coordinateTransformations || [])]) {
    if (transform.type==="scale") transform.scale.forEach((n:number,i:number)=>{scale[i]*=n;origin[i]*=n;});
    if (transform.type==="translation") transform.translation.forEach((n:number,i:number)=>{origin[i]+=n;});
  }
  const result:Section[] = [
    {id:"dimensions",title:"Image & calibration",value:{"Image":data.omero.image?.name,"Field":image?.path,"OME-NGFF version":data.zarr.ngff_version,"Zarr format":data.zarr.format,"Pixel type":first?.dtype || first?.data_type,
      "Dimensions":axes.map((axis:any,i:number)=>({axis:axis.name,type:axis.type,length:first?.shape?.[i],spacing:scale[i],unit:axis.unit || (axis.type==="space"?"not specified":undefined),origin:origin[i]}))}},
    {id:"channels",title:"Channels",value:(attrs.omero?.channels || data.omero.channels || []).map((channel:any,index:number)=>({index,label:channel.label,...channel}))},
    {id:"levels",title:"Resolution levels",value:datasets.map((dataset:any)=>{const array=nodes.find(node=>node.path===join(image?.path||".",dataset.path))?.array;return {path:dataset.path,shape:array?.shape,"pixel type":array?.dtype||array?.data_type,chunks:array?.chunks||array?.chunk_grid?.configuration?.chunk_shape,transformations:dataset.coordinateTransformations};})},
    {id:"labels",title:"Label layers",value:nodes.filter(node=>ome(node.attributes)["image-label"]).map(node=>({path:node.path,...ome(node.attributes)}))},
  ];
  const plate=nodes.filter(node=>ome(node.attributes).plate || ome(node.attributes).well);
  if (plate.length) result.push({id:"plate",title:"Plate & wells",value:plate.map(node=>({path:node.path,...ome(node.attributes)}))});
  result.push({id:"raw",title:"All OME-Zarr metadata",value:nodes.map(node=>({path:node.path,documents:node.documents}))});
  for (const [key,title] of [["image","OMERO image"],["pixels","OMERO pixels & calibration"],["channels","OMERO channels"],["planes","OMERO planes & timing"],["instrument","OMERO instrument"],["objective","OMERO objective"],["environment","OMERO environment"],["stage","OMERO stage"],["acquisition_date","OMERO acquisition"],["annotations","OMERO annotations & key-values"],["ancestors","OMERO containers & key-values"],["original_metadata","OMERO original metadata"]])
    if (data.omero[key]!=null) result.push({id:`omero-${key}`,title,value:data.omero[key]});
  return result;
}

const readableNumber = (n:number) => Number.isFinite(n) ? Number(n.toPrecision(7)).toString() : String(n);
function Value({value}:{value:unknown}) {
  if (value==null) return <span className="muted">Not specified</span>;
  if (typeof value!=="object") return <span className="metadata-value">{String(value)}</span>;
  if ("value" in value && "unit" in value && typeof value.value==="number") return <span title={JSON.stringify(value)}>{readableNumber(value.value)} {unitLabel(String(value.unit).toLowerCase().split(".").at(-1)!)}</span>;
  if (Array.isArray(value) && !value.length) return <span className="muted">None recorded</span>;
  if (Array.isArray(value) && value.every(item=>item==null || typeof item!=="object")) return <span className="metadata-value">{value.join(", ")}</span>;
  return <details className="metadata-detail"><summary>{Array.isArray(value)?`${value.length} entries`:`${Object.keys(value).length} fields`}</summary><pre>{JSON.stringify(value,null,2)}</pre></details>;
}
function DimensionTable({rows}:{rows:any[]}) {
  return <div className="metadata-dimensions"><table className="metadata-table"><thead><tr>{["Axis","Size","Spacing","Unit","Origin"].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((axis,i)=><tr key={i}><td>{axis.axis?.toUpperCase()}</td><td>{axis.length ?? "—"}</td><td title={String(axis.spacing)}>{readableNumber(axis.spacing)}</td><td>{axis.unit?unitLabel(axis.unit):"—"}</td><td title={String(axis.origin)}>{readableNumber(axis.origin)}</td></tr>)}</tbody></table></div>;
}
function RecordTable({value}:{value:unknown}) {
  if (!value || typeof value!=="object") return <Value value={value}/>;
  if (Array.isArray(value)) {
    if (!value.length) return <p className="muted">None recorded.</p>;
    // Preserve duplicate map-annotation keys rather than collapsing them to an object.
    if (value.every(item=>Array.isArray(item)&&item.length===2)) return <table className="metadata-table"><tbody>{value.map((pair,i)=><tr key={i}><th>{String(pair[0])}</th><td><Value value={pair[1]}/></td></tr>)}</tbody></table>;
    return <div className="metadata-records">{value.map((item,i)=><article key={i}><RecordTable value={item}/></article>)}</div>;
  }
  return <table className="metadata-table"><tbody>{Object.entries(value).filter(([,v])=>v!==undefined).map(([key,item])=><tr key={key}><th>{key.replaceAll("_"," ")}</th><td>{key==="date" && typeof item==="number"?<time dateTime={new Date(item*1000).toISOString()}>{new Date(item*1000).toLocaleString()}</time>:key==="value" && Array.isArray(item) && item.every(pair=>Array.isArray(pair)&&pair.length===2)?<RecordTable value={item}/>:<Value value={item}/>}</td></tr>)}</tbody></table>;
}

export function MetadataWindow({imageId,field,onClose}:{imageId:number;field:string;onClose:()=>void}) {
  const [data,setData]=useState<MetadataPayload>(); const [error,setError]=useState(""); const [retry,setRetry]=useState(0);
  const [query,setQuery]=useState(""); const [limit,setLimit]=useState(100);
  const [position,setPosition]=useState({x:Math.max(8,(window.innerWidth-1000)/2),y:70});
  const panel=useRef<HTMLElement>(null), search=useRef<HTMLInputElement>(null), drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null; search.current?.focus();
    return ()=>previous?.focus();
  },[]);
  useEffect(()=>{
    const controller=new AbortController(); setError("");setData(undefined);
    const url=window.BIOMERO_ZARR_VIEWER.capabilitiesTemplate.replace(/\/0\/capabilities\/$/,`/${imageId}/metadata/`);
    fetch(url,{credentials:"same-origin",headers:{Accept:"application/json"},signal:controller.signal}).then(async response=>{
      if (response.redirected && new URL(response.url).pathname.includes("login")) throw new Error("Please sign in to OMERO and try again.");
      const payload=await response.json(); if(!response.ok) throw new Error(payload.error?.message || "Metadata could not be loaded.");
      if(!controller.signal.aborted) setData(payload);
    }).catch(error=>{if(!controller.signal.aborted)setError(String(error.message || error));});
    return ()=>controller.abort();
  },[imageId,retry]);
  const sections=useMemo(()=>data?metadataSections(data,field):[],[data,field]);
  const filter=query.trim().toLowerCase();
  const matching=useMemo(()=>sections.flatMap(section=>{
    if(!filter || section.title.toLowerCase().includes(filter)) return [section];
    if(Array.isArray(section.value)) {const value=section.value.filter(item=>JSON.stringify(item).toLowerCase().includes(filter));return value.length?[{...section,value}]:[];}
    return JSON.stringify(section.value).toLowerCase().includes(filter)?[section]:[];
  }),[sections,filter]);
  const notices=[...(data?.zarr.notices || []),...(data?.omero.notices || [])];
  function startDrag(event:PointerEvent<HTMLElement>) {
    if(event.button!==0 || (event.target as HTMLElement).closest("button")) return;
    drag.current={x:event.clientX,y:event.clientY,left:position.x,top:position.y};event.currentTarget.setPointerCapture(event.pointerId);
  }
  return <aside id="image-metadata" className="help-window metadata-window" style={{left:position.x,top:position.y}} ref={panel} role="dialog" aria-modal="false" aria-label="Image metadata" onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();onClose();}}}>
    <header className="help-window-titlebar" onPointerDown={startDrag} onPointerMove={event=>{const start=drag.current;if(start)setPosition({x:Math.max(8,Math.min(window.innerWidth-(panel.current?.offsetWidth||0)-8,start.left+event.clientX-start.x)),y:Math.max(8,Math.min(window.innerHeight-60,start.top+event.clientY-start.y))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
      <div><strong>Image metadata</strong><small>OME-Zarr · OMERO #{imageId}</small></div>
      <button className="icon-button" aria-label="Close metadata" title="Close metadata" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
    </header>
    <div className="help-window-search"><input ref={search} aria-label="Search metadata" placeholder="Search names, keys or values…" value={query} onChange={event=>{setQuery(event.target.value);setLimit(100);}}/><small>{data?`${data.zarr.nodes.length} Zarr nodes`:"Loading metadata…"}</small></div>
    {!data&&!error&&<div className="metadata-status" role="status">Reading OME-Zarr and OMERO metadata…</div>}
    {error&&<div className="metadata-status" role="alert"><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
    {data&&<div className="help-window-layout">
      <nav aria-label="Metadata categories"><strong>Categories</strong>{matching.map(section=><button key={section.id} onClick={()=>document.getElementById(`metadata-${section.id}`)?.scrollIntoView({behavior:"smooth",block:"start"})}>{section.title}</button>)}</nav>
      <div className="help-window-content metadata-content" tabIndex={0} aria-label="Metadata details">
        {matching.map(section=><section id={`metadata-${section.id}`} key={section.id}><h2>{section.title}</h2>{section.id==="raw"?<>
          {(section.value as any[]).slice(0,limit).map(node=><details className="metadata-node" key={node.path}><summary>{node.path==="."?"Store root":node.path}</summary><RecordTable value={node.documents}/></details>)}
          {(section.value as any[]).length>limit&&<button onClick={()=>setLimit(n=>n+100)}>Show more metadata nodes</button>}
        </>:section.id==="dimensions"?<><RecordTable value={Object.fromEntries(Object.entries(section.value as any).filter(([key])=>key!=="Dimensions"))}/><DimensionTable rows={(section.value as any).Dimensions}/></>:<RecordTable value={section.value}/>}</section>)}
        {!matching.length&&<p>No metadata matches “{query}”.</p>}
        {notices.length>0&&<section><h2>Availability</h2>{notices.map((notice,i)=><p className="muted" key={i}>{notice}</p>)}</section>}
      </div>
    </div>}
  </aside>;
}

export function ViewerMetadata({imageId,field}:{imageId:number|null;field:string}) {
  const [open,setOpen]=useState(false);
  return <><button className={`icon-button ${open?"active":""}`} aria-label="Image metadata" title="Image metadata" disabled={!imageId} aria-expanded={open} aria-controls={open?"image-metadata":undefined} onClick={()=>setOpen(value=>!value)}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M12 15v3m0-5v.1"/></svg>
  </button>{open&&imageId&&<MetadataWindow imageId={imageId} field={field} onClose={()=>setOpen(false)}/>}</>;
}
