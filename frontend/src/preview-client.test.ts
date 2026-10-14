import { requestPreview } from "./preview-client";

test("plate fields are grouped into bounded batches and reused without another request",async()=>{
  vi.useFakeTimers();
  const auth={previewUrl:'/previews/',volumeIdentity:'binding',fetch:vi.fn(async(url:string)=>{
    const fields=JSON.parse(new URL(url,'http://localhost').searchParams.get('fields')!);
    return new Response(JSON.stringify({previews:fields.map((field:string)=>({field,width:62,height:62,full_width:2008,level:5,url:'data:image/png;base64,test'}))}));
  })};
  const controller=new AbortController();
  const promises=Array.from({length:20},(_,i)=>requestPreview(auth as any,`A/${i}/0`,64,[],0,0,controller.signal));
  await vi.runAllTimersAsync();
  expect(await Promise.all(promises)).toHaveLength(20);
  expect(auth.fetch).toHaveBeenCalledTimes(2);
  await requestPreview(auth as any,'A/0/0',64,[],0,0,controller.signal);
  expect(auth.fetch).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
