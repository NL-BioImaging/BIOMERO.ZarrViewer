import { DetailView, OverviewView, MultiscaleImageLayer, MAX_CHANNELS } from '@hms-dbmi/viv';
import { actualScaleProps, nonBinaryPyramid, ActualScaleOverviewLayer } from './pyramid-layers';
import { GentleDetailView } from './viv-navigation';
const selectedBatches=new WeakMap<object,Map<string,any[]>>();
function stableSelections(selections:any[],indices:number[]):any[]{
  let cache=selectedBatches.get(selections);if(!cache){cache=new Map();selectedBatches.set(selections,cache);}
  const key=indices.join(',')+':'+JSON.stringify(indices.map(i=>selections[i]));
  let selected=cache.get(key);if(!selected){selected=indices.map(i=>selections[i]);cache.set(key,selected);}
  return selected;
}

/** Never send invisible channels or more textures than Viv can bind in one draw. */
export function channelBatches(props:any):any[] {
  const visible=props.selections.map((_:unknown,i:number)=>i).filter((i:number)=>props.channelsVisible?.[i]!==false);
  const result:any[]=[];
  for(let offset=0;offset<visible.length;offset+=MAX_CHANNELS){
    const indices=visible.slice(offset,offset+MAX_CHANNELS);
    result.push({...props,selections:stableSelections(props.selections,indices),channelsVisible:indices.map(()=>true),
      colors:indices.map((i:number)=>props.colors[i]),contrastLimits:indices.map((i:number)=>props.contrastLimits[i]),
      onViewportLoad:()=>props.onBatchViewportLoad?props.onBatchViewportLoad(resultIndex(offset)):props.onViewportLoad?.(),
      onTileError:(error:unknown)=>props.onBatchTileError?props.onBatchTileError(resultIndex(offset),error):props.onTileError?.(error),
      ...(offset?{parameters:{...props.parameters,depthWriteEnabled:false,blend:true,blendColorOperation:'add',blendColorSrcFactor:'one',blendColorDstFactor:'one',blendAlphaSrcFactor:'zero',blendAlphaDstFactor:'one'}}:{}),
    });
  }
  return result;
}
const resultIndex=(offset:number)=>Math.floor(offset/MAX_CHANNELS);

export class MultiplexDetailView extends GentleDetailView {
  getLayers(args:any):any{return channelBatches(args.props).flatMap((props,index)=>{
    if(nonBinaryPyramid(props.loader)) {
      const scaled=actualScaleProps(props,Number(args.viewStates?.[this.id]?.zoom||0));
      return [new MultiscaleImageLayer({...scaled,id:`actual-pyramid-#${this.id}#-channels-${index}`,viewportId:this.id})];
    }
    return super.getLayers({props}).flat().map((layer:any)=>layer.clone({id:`${layer.id}-channels-${index}`}));
  });}
}
export class MultiplexOverviewView extends OverviewView {
  getLayers(args:any):any{return channelBatches(args.props).flatMap((props,index)=>super.getLayers({...args,props}).flat().map((layer:any)=>
    nonBinaryPyramid(props.loader) ? new ActualScaleOverviewLayer({...layer.props,id:`${layer.id}-channels-${index}`}) : layer.clone({id:`${layer.id}-channels-${index}`})));}
}
