import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { metadataSections, MetadataWindow, ViewerMetadata, type MetadataPayload } from "./MetadataWindow";

const data:MetadataPayload = {
  zarr:{format:2,ngff_version:"0.4",kind:"image",notices:[],nodes:[
    {path:".",attributes:{multiscales:[{axes:[{name:"c",type:"channel"},{name:"z",type:"space",unit:"micrometer"},{name:"y",type:"space",unit:"micrometer"},{name:"x",type:"space",unit:"micrometer"}],datasets:[{path:"0",coordinateTransformations:[{type:"scale",scale:[1,2,.5,.5]}]}]}],omero:{channels:[{label:"DNA",color:"0000FF"}]},custom:{batch:"special-batch"}},documents:{".zattrs":{custom:{batch:"special-batch"}}}},
    {path:"0",attributes:{},array:{shape:[1,4,8,10],dtype:"<u2",chunks:[1,2,4,5]},documents:{".zarray":{shape:[1,4,8,10]}}}
  ]},
  omero:{image:{id:42,name:"Sample"},annotations:[{namespace:"experiment",value:[["key","one"],["key","two"]]}],ancestors:[],notices:[]}
};
beforeEach(()=>{window.BIOMERO_ZARR_VIEWER={capabilitiesTemplate:"/api/images/0/capabilities/"};});
afterEach(()=>vi.unstubAllGlobals());

test("metadata summaries derive stored size, calibrated spacing and channel names",()=>{
  const sections=metadataSections(data,".");
  const dimensions=sections.find(section=>section.id==="dimensions")!.value as any;
  expect(dimensions.Dimensions.map((axis:any)=>axis.length)).toEqual([1,4,8,10]);
  expect(dimensions.Dimensions.map((axis:any)=>axis.spacing)).toEqual([1,2,.5,.5]);
  expect(sections.find(section=>section.id==="channels")!.value).toEqual([{index:0,label:"DNA",color:"0000FF"}]);
  expect(sections.at(-2)?.title).toBe("OMERO annotations & key-values");
});

test("metadata is fetched on opening, grouped, searchable and closable",async()=>{
  const request=vi.fn(async()=>({ok:true,redirected:false,json:async()=>data}));vi.stubGlobal("fetch",request);
  render(<ViewerMetadata imageId={42} field="."/>);
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Image metadata"}));
  await screen.findByRole("heading",{name:"Image & calibration"});
  expect(request).toHaveBeenCalledWith("/api/images/42/metadata/?field=.&section=summary",expect.objectContaining({credentials:"same-origin"}));
  expect(screen.getByRole("dialog",{name:"Image metadata"})).toBeInTheDocument();
  expect(screen.getByText("DNA")).toBeInTheDocument();
  expect(screen.getByRole("heading",{name:"OMERO annotations & key-values"})).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox",{name:"Search metadata"}),{target:{value:"special-batch"}});
  expect(screen.getByRole("heading",{name:"All OME-Zarr metadata"})).toBeInTheDocument();
  expect(screen.queryByRole("heading",{name:"Channels"})).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("metadata errors can be retried without hiding the viewer",async()=>{
  const request=vi.fn().mockRejectedValueOnce(new Error("server unavailable")).mockResolvedValueOnce({ok:true,json:async()=>data});vi.stubGlobal("fetch",request);
  render(<MetadataWindow imageId={42} field="." onClose={()=>{}}/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("server unavailable");
  fireEvent.click(screen.getByRole("button",{name:"Retry"}));
  await waitFor(()=>expect(screen.getByRole("heading",{name:"Channels"})).toBeInTheDocument());
});

test("plate metadata stays available while dimensions describe the selected field",()=>{
  const plate:MetadataPayload={...data,zarr:{...data.zarr,kind:"plate",nodes:[
    {path:".",attributes:{plate:{name:"Plate",rows:[{name:"A"}],columns:[{name:"1"}]}},documents:{}},
    {...data.zarr.nodes[0],path:"A/1/0"},{...data.zarr.nodes[1],path:"A/1/0/0"}
  ]}};
  const sections=metadataSections(plate,"A/1/0");
  expect(sections.some(section=>section.title==="Plate & wells")).toBe(true);
  expect((sections.find(section=>section.id==="dimensions")!.value as any).Dimensions[3].length).toBe(10);
});

test("remaining hierarchy loads only on demand and closing cancels an active page",async()=>{
  let pageSignal:AbortSignal|undefined;
  const request=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({...data,zarr:{...data.zarr,next_cursor:"signed-page"}})}).mockImplementationOnce((_:string,options:any)=>{pageSignal=options.signal;return new Promise(()=>{});});
  vi.stubGlobal("fetch",request);
  const {unmount}=render(<MetadataWindow imageId={42} field="A/1/0" onClose={()=>{}}/>);
  const browse=await screen.findByRole("button",{name:"Browse more store metadata"});
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(browse);
  expect(request.mock.calls[1][0]).toBe("/api/images/42/metadata/?field=A%2F1%2F0&section=nodes&cursor=signed-page");
  expect(screen.getByRole("button",{name:"Loading metadata page…"})).toBeDisabled();
  unmount();expect(pageSignal?.aborted).toBe(true);
});

test("HTML worker failures produce a readable error and retry",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>{throw new SyntaxError("Unexpected token <");}})));
  render(<MetadataWindow imageId={42} field="." onClose={()=>{}}/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("metadata service could not respond");
  expect(screen.getByRole("button",{name:"Retry"})).toBeEnabled();
});
