import { mosaicLevel,mosaicVisibleTiles,MosaicClient,type MosaicInfo } from './mosaic-client';
import { defaultPlateFieldIndex } from './OverviewGrid';
import { parseDeepLink,writeDeepLink } from './viewer-state';

const info:MosaicInfo={key:'mosaic',status:'ready',progress:1,width:49152,height:32768,factor:5,levels:8,tile_size:512,full_width:2008};

test('zoom selects pyramid resolution and requests only intersecting tiles',()=>{
  expect(mosaicLevel(info,.1)).toBe(5);
  expect(mosaicLevel(info,4,2)).toBe(0);
  const tiles=mosaicVisibleTiles(info,0,{left:200,top:200,right:400,bottom:400});
  expect(tiles).toHaveLength(9);
  expect(tiles[0]).toMatchObject({x:1,y:1,left:102.4,top:102.4});
  expect(mosaicVisibleTiles(info,7,{left:0,top:0,right:100000,bottom:100000})).toHaveLength(1);
});

test('cached native tiles are reused across zoom visits',async()=>{
  vi.stubGlobal('URL',URL);
  URL.createObjectURL=vi.fn(()=> 'blob:tile');URL.revokeObjectURL=vi.fn();
  const auth={mosaicUrl:'/mosaic/',volumeIdentity:'binding',fetch:vi.fn(async()=>new Response(new Blob(['png'])))};
  const client=new MosaicClient(auth as any),signal=new AbortController().signal;
  expect(await client.tile(info,0,2,3,signal)).toBe('blob:tile');
  expect(await client.tile(info,0,2,3,signal)).toBe('blob:tile');
  expect(auth.fetch).toHaveBeenCalledTimes(1);
});

test('initial plate field is the middle field and explicit choices survive deep links',()=>{
  const capability={plate:{wells:[{fields:Array.from({length:9},(_,i)=>({path:`A/1/${i}`}))}]}};
  expect(defaultPlateFieldIndex(capability as any)).toBe(4);
  const url=writeDeepLink(42,{view:'plate',plateField:2,z:0,t:0});
  expect(parseDeepLink(new URL(url,'http://localhost').search).plateField).toBe(2);
});
