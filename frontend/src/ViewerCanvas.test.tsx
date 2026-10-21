import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ViewerCanvas } from "./ViewerCanvas";
import {useEffect,useMemo,useState} from 'react';
import {channelBatches} from './multiplex-views';
import {withVolumeCache,type LoadProgress} from './volume-loader';
import {projectLoader} from './projection-loader';
const state=vi.hoisted(()=>({props:undefined as any,exercise:false,starts:0,completed:[] as any[],failures:[] as string[]}));
vi.mock("@hms-dbmi/viv",()=>({
  DETAIL_VIEW_ID:"detail",OVERVIEW_VIEW_ID:"overview",MAX_CHANNELS:10,
  DetailView:class{},VolumeView:class{},OverviewView:class{},OverviewLayer:class{},MultiscaleImageLayer:class{},ColorPaletteExtension:class{},
  getDefaultInitialViewState:()=>({target:[2,2,0],zoom:0}),
  VivViewer:(props:any)=>{
    state.props=props;
    const batch=state.exercise?channelBatches(props.layerProps[0])[0]:undefined;
    // Match Viv's real getTileData update triggers. GPU drawing is irrelevant
    // to whether progress renders cancel the still-pending pixel consumers.
    useEffect(()=>{
      if(!batch)return;
      const abort=new AbortController();state.starts++;
      Promise.all(batch.selections.map((selection:any)=>batch.loader[0].getTile({x:0,y:0,selection,signal:abort.signal})))
        .then(results=>{if(!abort.signal.aborted){state.completed=results;batch.onViewportLoad();}})
        .catch(error=>{if(!abort.signal.aborted)state.failures.push(String(error));});
      return ()=>abort.abort();
    },[batch?.loader,batch?.selections]);
    return null;
  },
}));
vi.mock("./categorical-image-layer",()=>({CategoricalMultiscaleImageLayer:class{props:any;constructor(props:any){this.props=props;}}}));
vi.mock("./instance-color-extension",()=>({InstanceColorExtension:class{}}));

test("2D playback ignores minimap readiness and waits for all visible label layers",()=>{
  const ready=vi.fn(),source={labels:["z","y","x"],shape:[2,4,4],dtype:"Uint16"};
  const props={width:800,height:600,loader:[source],labels:[{id:"cells",loader:[source]}],
    channels:[{index:0,label:"DNA",visible:true,color:"#00FF00",low:0,high:100,domainMin:0,domainMax:65535}],
    labelStates:[{id:"cells",name:"Cells",path:"labels/cells",visible:true,opacity:.7,mode:"fill" as const}],
    z:0,t:0,showMinimap:true,showScale:false,onViewportChange:()=>{},onTileError:()=>{},onTilesLoaded:ready};
  const {rerender}=render(<ViewerCanvas {...props}/>);
  act(()=>state.props.layerProps[1].onBatchViewportLoad(0));expect(ready).not.toHaveBeenCalled();
  act(()=>state.props.layerProps[0].onBatchViewportLoad(0));expect(ready).not.toHaveBeenCalled();
  // Categorical layers are supplied directly to Deck in the viewer props.
  const label=state.props.deckProps.layers[0];
  act(()=>label.props.onViewportLoad());expect(ready).toHaveBeenCalledOnce();
  ready.mockClear();
  const previous=state.props.layerProps[0].onBatchViewportLoad;
  rerender(<ViewerCanvas {...props} t={1}/>);
  act(()=>previous(0));expect(ready).not.toHaveBeenCalled();
});

test("2D playback waits for every multiplex batch, including the highest channels",()=>{
  const ready=vi.fn(),source={labels:["c","y","x"],shape:[27,4,4],dtype:"Uint16"};
  const channels=Array.from({length:27},(_,index)=>({index,label:String(index),visible:true,color:"#FFFFFF",low:0,high:100,domainMin:0,domainMax:65535}));
  render(<ViewerCanvas width={800} height={600} loader={[source]} labels={[]} channels={channels} labelStates={[]} z={0} t={0} showMinimap={false} showScale={false} onViewportChange={()=>{}} onTileError={()=>{}} onTilesLoaded={ready}/>);
  act(()=>state.props.layerProps[0].onBatchViewportLoad(0));act(()=>state.props.layerProps[0].onBatchViewportLoad(1));expect(ready).not.toHaveBeenCalled();
  act(()=>state.props.layerProps[0].onBatchViewportLoad(2));expect(ready).toHaveBeenCalledOnce();
});

test("ordinary redraws preserve selections so Viv does not reload unchanged pixels",()=>{
  const source={labels:["c","y","x"],shape:[1,4,4],dtype:"Uint16"};
  const props={width:800,height:600,loader:[source],labels:[],channels:[{index:0,label:"DNA",visible:true,color:"#FFFFFF",low:0,high:100,domainMin:0,domainMax:100}],labelStates:[],z:0,t:0,showMinimap:false,showScale:false,onViewportChange:()=>{},onTileError:()=>{},onTilesLoaded:()=>{}};
  const {rerender}=render(<ViewerCanvas {...props}/>),first=state.props.layerProps[0].selections;
  rerender(<ViewerCanvas {...props}/>);
  expect(state.props.layerProps[0].selections).toBe(first);
  rerender(<ViewerCanvas {...props} t={1}/>);
  expect(state.props.layerProps[0].selections).not.toBe(first);
});


test.each([['mip',[3,6]],['mean',[2,4]],['min',[1,2]]] as const)('issue #17: pending %s volumes survive progress and contrast redraws through both selection layers',async(mode,expected)=>{
  state.exercise=true;state.starts=0;state.completed=[];state.failures=[];
  const releases:Array<()=>void>=[];let cancelled=0,prepareCount=0;
  const fetch=vi.fn((url:string,{signal}:any)=>{
    if(url.includes('download=1')){
      const values=new Uint16Array(3*1024*1024);
      const c=Number(new URL(url,'http://localhost').searchParams.get('job'));
      for(let z=0;z<3;z++)values.fill((c+1)*(z+1),z*1024*1024,(z+1)*1024*1024);
      return Promise.resolve(new Response(values.buffer));
    }
    if(++prepareCount>8)return Promise.reject(Error('Unbounded volume restart loop'));
    const c=Number(new URL(url,'http://localhost').searchParams.get('c'));
    return new Promise<Response>((resolve,reject)=>{
      const abort=()=>{cancelled++;reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});
      releases.push(()=>{signal.removeEventListener('abort',abort);resolve(new Response(JSON.stringify({status:'ready',key:String(c),shape:[3,1024,1024],dtype:'<u2',bytes:6291456})));});
    });
  });
  const auth={volumeUrl:'/volume/',volumeIdentity:'issue-17',fetch} as any;
  function Harness(){
    const [progress,setProgress]=useState<LoadProgress>({busy:false,fraction:0,phase:''});
    const [redraw,setRedraw]=useState(0),[ready,setReady]=useState(false);
    const empty=useMemo(()=>[],[]);
    const raw=useMemo(()=>[{labels:['t','c','z','y','x'],shape:[1,2,3,1024,1024],dtype:'Uint16',tileSize:256}],[]);
    const cached=useMemo(()=>withVolumeCache(raw,auth,'.',setProgress),[raw]);
    const projected=useMemo(()=>projectLoader(cached,mode),[cached,mode]);
    const channels=[0,1].map(index=>({index,label:String(index),visible:true,color:'#FFFFFF',low:redraw,high:100,domainMin:0,domainMax:65535}));
    return <><button onClick={()=>{setRedraw(n=>n+1);setProgress(p=>({...p,fraction:.5}));}}>Redraw progress and contrast</button>
      <output data-testid="mip-ready">{String(ready)}</output><output>{progress.phase}</output>
      <ViewerCanvas width={800} height={600} loader={projected} labels={empty} channels={channels} labelStates={empty} z={0} t={0} showMinimap={false} showScale={false} onViewportChange={()=>{}} onTileError={()=>{}} onTilesLoaded={()=>setReady(true)}/></>;
  }
  const view=render(<Harness/>);
  try{
    await waitFor(()=>expect(releases).toHaveLength(2));
    for(let n=0;n<8;n++)fireEvent.click(screen.getByRole('button',{name:'Redraw progress and contrast'}));
    await act(async()=>{await Promise.resolve();});
    expect(cancelled).toBe(0);expect(state.starts).toBe(1);expect(fetch).toHaveBeenCalledTimes(2);
    await act(async()=>{releases.forEach(release=>release());});
    await waitFor(()=>expect(screen.getByTestId('mip-ready')).toHaveTextContent('true'));
    expect(fetch).toHaveBeenCalledTimes(4);expect(cancelled).toBe(0);expect(state.failures).toEqual([]);
    expect(state.completed.map(result=>result.data[0])).toEqual(expected);
    expect(state.completed.map(result=>[result.width,result.height])).toEqual([[256,256],[256,256]]);
  }finally{view.unmount();state.exercise=false;}
},15000);
