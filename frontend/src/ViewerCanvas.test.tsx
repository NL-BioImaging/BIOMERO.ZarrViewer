import { act, render } from "@testing-library/react";
import { ViewerCanvas } from "./ViewerCanvas";
const state=vi.hoisted(()=>({props:undefined as any}));
vi.mock("@hms-dbmi/viv",()=>({
  DETAIL_VIEW_ID:"detail",OVERVIEW_VIEW_ID:"overview",MAX_CHANNELS:10,
  DetailView:class{},OverviewView:class{},OverviewLayer:class{},MultiscaleImageLayer:class{},ColorPaletteExtension:class{},
  getDefaultInitialViewState:()=>({target:[2,2,0],zoom:0}),
  VivViewer:(props:any)=>{state.props=props;return null;},
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
