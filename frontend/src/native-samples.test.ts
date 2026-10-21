import {nativeSamples} from './native-samples';
import {analyzeChannels} from './channel-scaling';

test('batched native sample framing retains channel order, values and time',async()=>{
  const header=new TextEncoder().encode(JSON.stringify({dtype:'<u2',channels:[{index:1,count:3},{index:0,count:2}]}));
  const values=new Uint16Array([0,1000,65535,2,30]);const buffer=new Uint8Array(4+header.length+values.byteLength);
  new DataView(buffer.buffer).setUint32(0,header.length,true);buffer.set(header,4);buffer.set(new Uint8Array(values.buffer),4+header.length);
  const fetch=vi.fn(async(_url?:string)=>new Response(buffer));
  const result=await nativeSamples({nativeSamplesUrl:'/samples',fetch} as any,[1,0],7,1024);
  expect(Array.from(result.get(1)!)).toEqual([0,1000,65535]);expect(Array.from(result.get(0)!)).toEqual([2,30]);
  expect(fetch.mock.calls[0][0]).toContain('t=7');
});

test('a shared sample batch feeds the unchanged native percentile/histogram calculation',async()=>{
  const channels=[0,1].map(index=>({index,label:String(index),visible:true,color:'#FFFFFF',low:0,high:65535,domainMin:0,domainMax:65535}));
  const pixels=Float64Array.from({length:4000},(_,i)=>i%1024);
  const normal={labels:['c','y','x'],shape:[2,40,100],getRaster:vi.fn(async()=>({data:pixels,width:100,height:40}))};
  const batch={...normal,getNativeSamples:vi.fn(async()=>new Map([[0,pixels],[1,pixels]]))};
  expect(await analyzeChannels([batch],channels)).toEqual(await analyzeChannels([normal],channels));
  expect(batch.getNativeSamples).toHaveBeenCalledOnce();
});
