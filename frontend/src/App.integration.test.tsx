import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import App from "./App";
import { fetchCapabilities } from "./api";
import { loadOmeZarrFromStore } from "@hms-dbmi/viv";
import type { Capability } from "./types";

vi.mock("./api",async importOriginal=>({...await importOriginal<any>(),fetchCapabilities:vi.fn()}));
vi.mock("@hms-dbmi/viv",async importOriginal=>({...await importOriginal<any>(),loadOmeZarrFromStore:vi.fn()}));
vi.mock("./volume-utils",async importOriginal=>({...await importOriginal<any>(),detectMax3dTextureSize:()=>2048}));
function Canvas(props:any){useEffect(()=>(props.onReady||props.onTilesLoaded)?.(),[props.t,props.z,props.loader]);return <output data-testid="rendered-contrast" data-t={props.t} data-camera-command={props.resetKey} data-navigation={JSON.stringify(props.viewport||props.camera)}>{JSON.stringify(props.channels.map((c:any)=>[c.low,c.high]))}</output>;}
vi.mock("./ViewerCanvas",()=>({ViewerCanvas:(props:any)=><Canvas {...props}/>}));
vi.mock("./VolumeCanvas",()=>({VolumeCanvas:(props:any)=><Canvas {...props}/>}));
vi.mock("./NeuroglancerCanvas",()=>({NeuroglancerCanvas:(props:any)=><Canvas {...props}/>}));
const capability:Capability={schema_version:1,supported:true,image:{id:539,name:"DNA"},store:{url:"/data/",context:"signed",expires_at:"later",neuroglancer_url:"/ng/"},kind:"image",initial_path:".",axes:[{name:"c"},{name:"z",unit:"micrometer"},{name:"y",unit:"micrometer"},{name:"x",unit:"micrometer"}],datasets:[{path:"0",coordinate_transformations:[{type:"scale",scale:[1,2,.2,.2]}]}],channels:[{index:0,label:"DNA",active:true,color:"#00FF00",window:{min:0,max:32767,start:0,end:32767}}],labels:[],ngff_version:"0.4",zarr_format:2};
let maximum=1000;
beforeEach(()=>{
  maximum=1000;window.history.replaceState({},"","/?image=539");
  window.BIOMERO_ZARR_VIEWER={capabilitiesTemplate:"/api/images/0/capabilities/"};
  vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
  vi.mocked(fetchCapabilities).mockResolvedValue(capability);
  vi.mocked(loadOmeZarrFromStore).mockImplementation(async()=>({data:[{labels:["c","z","y","x"],shape:[1,8,2,3],dtype:"Uint16",tileSize:256,getRaster:async()=>({data:new Uint16Array([0,10,20,30,40,maximum]),width:3,height:2})}],metadata:{multiscales:[{axes:capability.axes,datasets:[{path:"0",coordinateTransformations:[{type:"scale",scale:[1,2,.2,.2]}]}]}]}}) as any);
});
afterEach(()=>vi.unstubAllGlobals());

test('VRAM controls are 3D-only and an insufficient budget keeps settings accessible without rendering a volume',async()=>{
  localStorage.clear();
  const axes=[{name:'t'},...capability.axes];
  vi.mocked(loadOmeZarrFromStore).mockResolvedValue({data:[{labels:['t','c','z','y','x'],shape:[2,1,128,512,512],dtype:'Uint16',tileSize:256,
    getRaster:async()=>({data:new Uint16Array([0,10,20,30,40,1000]),width:3,height:2})}],metadata:{multiscales:[{axes,datasets:[{path:'0',coordinateTransformations:[{type:'scale',scale:[1,1,2,.2,.2]}]}]}]}} as any);
  render(<App/>);await screen.findByTestId('rendered-contrast');
  expect(screen.queryByLabelText('GPU VRAM')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'3D'}));
  expect(await screen.findByLabelText('GPU VRAM')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Max VRAM'),{target:{value:'100'}});
  await screen.findByText('No quality level fits this memory budget. Increase Max VRAM or choose your GPU VRAM.');
  expect(screen.queryByTestId('rendered-contrast')).not.toBeInTheDocument();
  expect(screen.getByLabelText('3D volume quality')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('GPU VRAM'),{target:{value:'24'}});
  fireEvent.change(screen.getByLabelText('Max VRAM'),{target:{value:'auto'}});
  await screen.findByTestId('rendered-contrast');
  expect(screen.getByLabelText('3D volume quality')).toBeEnabled();
  fireEvent.click(screen.getByRole('button',{name:'2D'}));
  expect(screen.queryByLabelText('Max VRAM')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('GPU VRAM')).not.toBeInTheDocument();
  localStorage.clear();
});

test("HTTP images render source contrast before native statistics finish",async()=>{
  vi.mocked(fetchCapabilities).mockResolvedValue({...capability,store:{...capability.store,transport:"http"}});
  const pixels=vi.fn(()=>new Promise(()=>{}));
  vi.mocked(loadOmeZarrFromStore).mockResolvedValue({data:[{labels:["c","z","y","x"],shape:[1,8,2,3],dtype:"Uint16",tileSize:256,getRaster:pixels}],metadata:{multiscales:[{axes:capability.axes,datasets:[{path:"0"}]}]}} as any);
  render(<App/>);
  await screen.findByTestId("rendered-contrast");
  expect(screen.getByTestId("rendered-contrast")).toHaveTextContent("[0,32767]");
  expect(pixels).not.toHaveBeenCalled();
});

test("fresh HTTP images apply delayed initial AUTO contrast",async()=>{
  vi.mocked(fetchCapabilities).mockResolvedValue({...capability,store:{...capability.store,transport:"http"}});
  render(<App/>);
  await waitFor(()=>expect(screen.getByTestId('rendered-contrast')).toHaveTextContent('[10,1000]'));
  expect(screen.getByRole('spinbutton',{name:'DNA maximum value'})).toHaveValue(1000);
});

test.each(['manual','saved'])("delayed HTTP AUTO preserves %s contrast",async kind=>{
  vi.mocked(fetchCapabilities).mockResolvedValue({...capability,store:{...capability.store,transport:"http"}});
  if(kind==='saved')window.history.replaceState({},'', '/?image=539&v=2&channels='+encodeURIComponent(JSON.stringify([{index:0,visible:true,color:'#00FF00',low:5,high:800}])));
  render(<App/>);await screen.findByTestId('rendered-contrast');
  if(kind==='manual')fireEvent.change(screen.getByRole('spinbutton',{name:'DNA maximum value'}),{target:{value:'800'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'AUTO'})).toBeEnabled());
  expect(screen.getByTestId('rendered-contrast')).toHaveTextContent(kind==='saved'?'[5,800]':'[0,800]');
});

test.each(['2D','3D'])("%s playback freezes intensity controls and statistics until paused",async mode=>{
  const raster=vi.fn(async({selection}:any)=>({data:new Uint16Array([0,10,20,30,40,selection.t?2000:1000]),width:3,height:2}));
  vi.mocked(loadOmeZarrFromStore).mockResolvedValue({data:[{labels:['t','c','z','y','x'],shape:[4,1,8,2,3],dtype:'Uint16',tileSize:256,getRaster:raster}],metadata:{multiscales:[{axes:[{name:'t'},...capability.axes],datasets:[{path:'0'}]}]}} as any);
  render(<App/>);
  await waitFor(()=>expect(screen.getByTestId('rendered-contrast')).toHaveTextContent('[10,1000]'));
  if(mode==='3D')fireEvent.click(screen.getByRole('button',{name:'3D'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'AUTO'})).toBeEnabled());
  const slider=screen.getByRole('slider',{name:'DNA display maximum'});
  const bounds=[slider.getAttribute('min'),slider.getAttribute('max'),slider.getAttribute('value')];
  const before=raster.mock.calls.length;
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole('button',{name:'Play'}));
    for(let frame=0;frame<3;frame++){
      await act(async()=>{vi.advanceTimersByTime(200);});
      expect(screen.getByTestId('rendered-contrast')).toHaveAttribute('data-t',String(frame+1));
      for(const name of ['DNA display minimum','DNA display maximum'])expect(screen.getByRole('slider',{name})).toBeDisabled();
      for(const name of ['DNA minimum value','DNA maximum value'])expect(screen.getByRole('spinbutton',{name})).toBeDisabled();
      for(const name of ['AUTO','FIT','HIST'])expect(screen.getByRole('button',{name})).toBeDisabled();
      expect([slider.getAttribute('min'),slider.getAttribute('max'),slider.getAttribute('value')]).toEqual(bounds);
      expect(screen.getByTestId('rendered-contrast')).toHaveTextContent('[10,1000]');
      expect(raster).toHaveBeenCalledTimes(before);
    }
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Pause'}));});
    expect(slider).toBeEnabled();
    expect(screen.getByRole('button',{name:'AUTO'})).toBeEnabled();
    expect(raster.mock.calls.length).toBeGreaterThan(before);
    expect(screen.getByTestId('rendered-contrast')).toHaveTextContent('[10,1000]');
  } finally {vi.useRealTimers();}
});

test('a late HTTP statistics result cannot change contrast during playback',async()=>{
  let resolvePixels!:(value:any)=>void;
  const pixels=vi.fn(()=>new Promise(resolve=>{resolvePixels=resolve;}));
  vi.mocked(fetchCapabilities).mockResolvedValue({...capability,store:{...capability.store,transport:'http'}});
  vi.mocked(loadOmeZarrFromStore).mockResolvedValue({data:[{labels:['t','y','x'],shape:[4,2,3],dtype:'Uint16',tileSize:256,getRaster:pixels}],metadata:{multiscales:[{axes:[{name:'t'},{name:'y'},{name:'x'}],datasets:[{path:'0'}]}]}} as any);
  render(<App/>);await waitFor(()=>expect(pixels).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:'Play'}));
  await act(async()=>resolvePixels({data:new Uint16Array([0,10,20,30,40,1000]),width:3,height:2}));
  expect(screen.getByTestId('rendered-contrast')).toHaveTextContent('[0,32767]');
  expect(screen.getByRole('slider',{name:'DNA display maximum'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Pause'}));
  expect(screen.getByRole('slider',{name:'DNA display maximum'})).toBeEnabled();
});

test("fresh opening samples useful contrast and mode changes preserve a manual range while refreshing statistics",async()=>{
  render(<App/>);await waitFor(()=>expect(screen.getByTestId("rendered-contrast")).toHaveTextContent("[10,1000]"));
  const high=screen.getByRole("spinbutton",{name:"DNA maximum value"});expect(high).toHaveValue(1000);
  fireEvent.change(high,{target:{value:"800"}});
  maximum=2000;fireEvent.click(screen.getByRole("button",{name:"3D"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"AUTO"})).toBeEnabled());
  expect(screen.getByTestId("rendered-contrast")).toHaveTextContent("[10,800]");
  fireEvent.click(screen.getByRole("button",{name:"2D"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"FIT"})).toBeEnabled());
  expect(screen.getByTestId("rendered-contrast")).toHaveTextContent("[10,800]");
  fireEvent.click(screen.getByRole("button",{name:"FIT"}));
  expect(screen.getByTestId("rendered-contrast")).toHaveTextContent("[0,2000]");
});

test("saved contrast outside sampled bounds stays exact in controls and both renderers",async()=>{
  window.history.replaceState({},"","/?image=539&v=2&channels="+encodeURIComponent(JSON.stringify([{index:0,visible:true,color:"#00FF00",low:-20,high:32767}])));
  render(<App/>);await screen.findByTestId("rendered-contrast");
  expect(screen.getByRole("spinbutton",{name:"DNA maximum value"})).toHaveValue(32767);
  expect(screen.getByRole("slider",{name:"DNA display maximum"})).toHaveValue("32767");
  fireEvent.click(screen.getByRole("button",{name:"3D"}));
  await waitFor(()=>expect(screen.getByTestId("rendered-contrast")).toHaveTextContent("[-20,32767]"));
});

test("malformed optional channel, overlay and label entries do not blank the application",async()=>{
  window.history.replaceState({},"","/?image=539&channels=%5Bnull%2C1%2C%7B%7D%5D&labels=%5Bnull%5D&overlays=%5Bnull%5D");
  render(<App/>);await screen.findByTestId("rendered-contrast");
  expect(screen.getByRole("spinbutton",{name:"DNA maximum value"})).toHaveValue(1000);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("resetting a 3D view updates the shared scale used when returning to 2D",async()=>{
  render(<App/>);await screen.findByTestId("rendered-contrast");
  fireEvent.click(screen.getByRole("button",{name:"3D"}));
  fireEvent.click(screen.getByRole("button",{name:"Reset 3D View"}));
  const camera=JSON.parse(screen.getByTestId("rendered-contrast").getAttribute("data-navigation")!);
  fireEvent.click(screen.getByRole("button",{name:"2D"}));
  const viewport=JSON.parse(screen.getByTestId("rendered-contrast").getAttribute("data-navigation")!);
  expect(.2/2**viewport.zoom).toBeCloseTo(camera.scale/1000/600);
});


test("Fit and native zoom explicitly command the embedded camera without changing contrast",async()=>{
  render(<App/>);await screen.findByTestId("rendered-contrast");
  fireEvent.click(screen.getByRole("button",{name:"3D"}));
  const output=screen.getByTestId("rendered-contrast");
  const initial=Number(output.getAttribute("data-camera-command"));
  fireEvent.click(screen.getByRole("button",{name:"Zoom 1:1"}));
  expect(Number(output.getAttribute("data-camera-command"))).toBe(initial+1);
  const native=JSON.parse(output.getAttribute("data-navigation")!);
  expect(native.scale/1000/600).toBeCloseTo(.2);
  fireEvent.click(screen.getByRole("button",{name:"Zoom fit"}));
  expect(Number(output.getAttribute("data-camera-command"))).toBe(initial+2);
  expect(output).toHaveTextContent("[10,1000]");
  fireEvent.click(screen.getByRole("button",{name:"2D"}));
  fireEvent.click(screen.getByRole("button",{name:"Zoom 1:1"}));
  expect(JSON.parse(screen.getByTestId("rendered-contrast").getAttribute("data-navigation")!).zoom).toBe(0);
});
