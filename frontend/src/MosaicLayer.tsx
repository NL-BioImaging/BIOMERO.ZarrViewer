import { useEffect, useMemo, useRef, useState } from "react";
import { MosaicClient, mosaicLevel, mosaicVisibleTiles, type MosaicInfo, type MosaicOptions } from "./mosaic-client";

interface Props {
  client:MosaicClient; options:MosaicOptions; zoom:number;
  visible:{left:number;top:number;right:number;bottom:number}; rebuild:number;
  onProgress:(value:MosaicInfo|null,error?:string)=>void;
  onThumbnail:(url:string,width:number)=>void;
}

export function MosaicLayer({client,options,zoom,visible,rebuild,onProgress,onThumbnail}:Props) {
  const [info,setInfo]=useState<MosaicInfo>();
  const [background,setBackground]=useState<string>();
  const identity=JSON.stringify(options);
  const lastRebuild=useRef(rebuild);
  useEffect(()=>{
    const controller=new AbortController();
    setInfo(undefined);setBackground(undefined);onProgress(null);
    const force = rebuild !== lastRebuild.current;
    lastRebuild.current = rebuild;
    const timer=window.setTimeout(()=>{
      void client.prepare(JSON.parse(identity),value=>onProgress(value),controller.signal,force)
        .then(async value=>{
          if(controller.signal.aborted)return;
          setInfo(value);
          const url=await client.tile(value,value.levels-1,0,0,controller.signal);
          if(!controller.signal.aborted){setBackground(url);onThumbnail(url,value.full_width);}
        }).catch(error=>{if(!controller.signal.aborted)onProgress(null,String(error));});
    },300);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[client,identity,rebuild,onProgress,onThumbnail]);
  const level=info?mosaicLevel(info,zoom,window.devicePixelRatio||1):0;
  const tiles=useMemo(()=>info?mosaicVisibleTiles(info,level,visible):[],[info,level,visible.left,visible.top,visible.right,visible.bottom]);
  if(!info)return null;
  return <div className="mosaic-layer" data-mosaic-level={level}>
    {background&&<img alt="" className="mosaic-background" src={background} style={{width:options.width,height:options.height}}/>}
    {tiles.map(tile=><MosaicTile key={`${info.key}:${level}:${tile.x}:${tile.y}`} client={client} info={info} level={level} tile={tile} onError={onProgress}/>)}
  </div>;
}

function MosaicTile({client,info,level,tile,onError}:{client:MosaicClient;info:MosaicInfo;level:number;tile:{x:number;y:number;left:number;top:number;width:number;height:number};onError:Props["onProgress"]}){
  const [url,setUrl]=useState<string>();
  useEffect(()=>{
    const controller=new AbortController();
    void client.tile(info,level,tile.x,tile.y,controller.signal).then(value=>{if(!controller.signal.aborted)setUrl(value);}).catch(error=>{if(!controller.signal.aborted)onError(info,String(error));});
    return ()=>controller.abort();
  },[client,info,level,tile.x,tile.y,onError]);
  return url?<img alt="" src={url} data-mosaic-tile={`${level}/${tile.x}/${tile.y}`} style={{position:"absolute",left:tile.left,top:tile.top,width:tile.width,height:tile.height}}/>:null;
}
