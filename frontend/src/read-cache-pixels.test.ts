import {loadOmeZarrFromStore} from '@hms-dbmi/viv';
import {withImageReadCache} from './http-read-cache';
import {projectSource} from './projection-loader';

test.each([2,3])('real Zarr v%i decoding retains full volumes, edge chunks, C/T and exact MIP pixels',async format=>{
  const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)),files=new Map<string,Uint8Array>(),reads:string[]=[];
  const attrs={version:format===2?'0.4':'0.5',multiscales:[{...(format===2?{version:'0.4'}:{}),axes:[
    {name:'t',type:'time',unit:'second'},{name:'c',type:'channel'},...['z','y','x'].map(name=>({name,type:'space',unit:'micrometer'}))],
    datasets:[{path:'0',coordinateTransformations:[{type:'scale',scale:[1,1,1.5,.5,.5]}]}]}]};
  const shape=[2,2,5,3,4],chunks=[1,1,2,3,4];
  if(format===2){
    files.set('.zgroup',encode({zarr_format:2}));files.set('.zattrs',encode(attrs));
    files.set('0/.zarray',encode({zarr_format:2,shape,chunks,dtype:'<u2',compressor:null,filters:null,fill_value:0,order:'C',dimension_separator:'/'}));
  }else{
    files.set('zarr.json',encode({zarr_format:3,node_type:'group',attributes:{ome:attrs}}));
    files.set('0/zarr.json',encode({zarr_format:3,node_type:'array',attributes:{},shape,data_type:'uint16',dimension_names:['t','c','z','y','x'],
      chunk_grid:{name:'regular',configuration:{chunk_shape:chunks}},chunk_key_encoding:{name:'default',configuration:{separator:'/'}},fill_value:0,codecs:[{name:'bytes',configuration:{endian:'little'}}]}));
  }
  const value=(t:number,c:number,z:number,y:number,x:number)=>t*1000+c*100+z*10+y*4+x;
  for(let t=0;t<2;t++)for(let c=0;c<2;c++)for(let block=0;block<3;block++){
    const data=new Uint16Array(24);for(let z=0;z<2;z++)for(let y=0;y<3;y++)for(let x=0;x<4;x++)
      if(block*2+z<5)data[(z*3+y)*4+x]=value(t,c,block*2+z,y,x);
    files.set(`0/${format===3?'c/':''}${t}/${c}/${block}/0/0`,new Uint8Array(data.buffer));
  }
  const store={get:async(key:string)=>{key=key.replace(/^\//,'');if(/^0\/(?:c\/)?\d/.test(key))reads.push(key);return files.get(key);}};
  const result=await loadOmeZarrFromStore(store as any);
  const [source]=withImageReadCache(result.data,{isHttp:true,readIdentity:'image'} as any);
  const volume=await source.getVolume({t:1,c:1});
  const expected=Array.from({length:60},(_,i)=>value(1,1,Math.floor(i/12),Math.floor(i/4)%3,i%4));
  expect(Array.from(volume.data)).toEqual(expected);expect(reads).toHaveLength(3);
  const mip=await projectSource(source,'mip').getRaster({selection:{t:1,c:1}});
  expect(Array.from(mip.data)).toEqual(expected.slice(48));expect(reads).toHaveLength(3);
  expect(Array.from((await source.getRaster({selection:{t:1,c:1,z:2}})).data)).toEqual(expected.slice(24,36));
});


test.each([2,3])('small storage chunks become 256px screen tiles with exact odd edge pixels (v%i)',async format=>{
  const encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)),files=new Map<string,Uint8Array>();
  const shape=[1,1,1,257,519],chunks=[1,1,1,32,32];
  const attrs={version:format===2?'0.4':'0.5',multiscales:[{axes:['t','c','z','y','x'].map(name=>({name,type:name==='c'?'channel':name==='t'?'time':'space'})),datasets:[{path:'0'}]}]};
  if(format===2){files.set('.zgroup',encode({zarr_format:2}));files.set('.zattrs',encode(attrs));files.set('0/.zarray',encode({zarr_format:2,shape,chunks,dtype:'<u2',compressor:null,filters:null,fill_value:0,order:'C',dimension_separator:'/'}));}
  else{files.set('zarr.json',encode({zarr_format:3,node_type:'group',attributes:{ome:attrs}}));files.set('0/zarr.json',encode({zarr_format:3,node_type:'array',attributes:{},shape,data_type:'uint16',dimension_names:['t','c','z','y','x'],chunk_grid:{name:'regular',configuration:{chunk_shape:chunks}},chunk_key_encoding:{name:'default',configuration:{separator:'/'}},fill_value:0,codecs:[{name:'bytes',configuration:{endian:'little'}}]}));}
  for(let y=0;y<9;y++)for(let x=0;x<17;x++){
    const data=Uint16Array.from({length:1024},(_,i)=>(y*32+Math.floor(i/32))*100+x*32+i%32);
    files.set(`0/${format===3?'c/':''}0/0/0/${y}/${x}`,new Uint8Array(data.buffer));
  }
  const result=await loadOmeZarrFromStore({get:async(key:string)=>files.get(key.replace(/^\//,''))} as any);
  const [source]=withImageReadCache(result.data,{isHttp:false,readIdentity:'odd'} as any);
  expect(source.tileSize).toBe(256);
  expect(source.statisticsSource.tileSize).toBe(32);
  const sample=await source.statisticsSource.getTile({x:16,y:8,selection:{t:0,c:0,z:0}});
  expect(Array.from(sample.data)).toEqual(Array.from({length:7},(_,x)=>25600+512+x));
  const edge=await source.getTile({x:2,y:1,selection:{t:0,c:0,z:0}});
  expect(edge.width).toBe(7);expect(edge.height).toBe(1);
  expect(Array.from(edge.data)).toEqual(Array.from({length:7},(_,x)=>25600+512+x));
});
