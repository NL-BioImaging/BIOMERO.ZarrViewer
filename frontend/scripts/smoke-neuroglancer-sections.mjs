// Real WebGL regression on tiny synthetic data; no public data or OMERO required.
import {createServer} from 'node:http';
import {existsSync,createReadStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright-core';

const staticRoot=process.env.VIEWER_STATIC_ROOT||resolve(import.meta.dirname,'../../src/biomero_zarr_viewer/static/biomero_zarr_viewer');
const evidence=resolve(import.meta.dirname,'../test-results');
const chrome=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].find(path=>path&&existsSync(path));
if(!chrome)throw Error('Chrome is required for Neuroglancer section acceptance.');
const shape=[16,32,48],chunk=[8,32,48],fixture=new Map(),json=value=>Buffer.from(JSON.stringify(value));
const pixels=count=>{const bytes=Buffer.alloc(count*2);for(let i=0;i<count;i++)bytes.writeUInt16LE(240,i*2);return bytes;};
const axes=['t','c','z','y','x'].map(name=>({name,type:name==='t'?'time':name==='c'?'channel':'space',...('zyx'.includes(name)?{unit:'micrometer'}:{})}));
const datasets=[{path:'0',coordinateTransformations:[{type:'scale',scale:[1,1,1,1,1]}]}];
const channels=[{index:0,label:'Uniform synthetic volume',active:true,color:'#FFFFFF',window:{start:0,end:255}}];
fixture.set('/data/.zgroup',json({zarr_format:2}));
fixture.set('/data/.zattrs',json({multiscales:[{version:'0.4',axes,datasets}]}));
fixture.set('/data/0/.zarray',json({zarr_format:2,shape:[1,1,...shape],chunks:[1,1,...chunk],dtype:'<u2',compressor:null,filters:null,fill_value:0,order:'C'}));
for(let z=0;z<2;z++)fixture.set(`/data/0/0.0.${z}.0.0`,pixels(chunk.reduce((a,b)=>a*b)));
const native='/ng/image-0/zarr';
fixture.set(native+'/.zgroup',json({zarr_format:2}));
fixture.set(native+'/.zattrs',json({multiscales:[{version:'0.4',axes:['z','y','x'].map(name=>({name,type:'space',unit:'nanometer'})),datasets:[{path:'0',coordinateTransformations:[{type:'scale',scale:[1000,1000,1000]}]}]}]}));
fixture.set(native+'/0/.zarray',json({zarr_format:2,shape,chunks:chunk,dtype:'<u2',compressor:null,filters:null,fill_value:0,order:'C'}));
fixture.set(native+'/0/.zattrs',json({_ARRAY_DIMENSIONS:['z','y','x']}));
for(let z=0;z<2;z++)fixture.set(`${native}/0/${z}.0.0`,pixels(chunk.reduce((a,b)=>a*b)));
fixture.set('/ng/image-0/info',json({type:'image',data_type:'uint16',num_channels:1,scales:[{key:'0',size:shape.slice().reverse(),voxel_offset:[0,0,0],resolution:[1000,1000,1000],chunk_sizes:[shape.slice().reverse()],encoding:'raw'}]}));
fixture.set('/ng/image-0/0/0-48_0-32_0-16',pixels(shape.reduce((a,b)=>a*b)));
const server=createServer((request,response)=>{
 const path=new URL(request.url,'http://fixture').pathname;
 if(/^\/api\/images\/[12]\/capabilities\/$/.test(path)){
  const id=Number(path.split('/')[3]);response.setHeader('Content-Type','application/json');
  response.end(json({schema_version:1,supported:true,image:{id,name:'Synthetic sections'},store:{url:'/data/',context:'fixture',expires_at:'2099-01-01',neuroglancer_url:`/api/images/${id}/neuroglancer/`},kind:'image',initial_path:'.',axes,datasets,channels,labels:[],ngff_version:'0.4',zarr_format:2}));return;
 }
 if(/^\/api\/images\/[12]\/neuroglancer\/$/.test(path)){
  response.setHeader('Content-Type','application/json');response.end(json({status:'ready',url:'/ng/',sources:{'image-0':{shape,resolution:[1000,1000,1000],translation:[0,0,0],segmentation:false,transport:path.includes('/1/')?'zarr':'chunks'}}}));return;
 }
 if(fixture.has(path)){response.end(fixture.get(path));return;}
 if(path==='/'){
  response.setHeader('Content-Type','text/html');response.end(`<!doctype html><html><head><link rel="stylesheet" href="/static/app.css"></head><body><div id="root"></div><script>window.BIOMERO_ZARR_VIEWER={capabilitiesTemplate:'/api/images/0/capabilities/',neuroglancerUrl:'/static/neuroglancer/index.html'}</script><script type="module" src="/static/app.js"></script></body></html>`);return;
 }
 const file=resolve(staticRoot,path.replace(/^\/static\//,''));
 if(!path.startsWith('/static/')||!file.startsWith(staticRoot+sep)||!existsSync(file)){response.statusCode=404;response.end();return;}
 response.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html','.wasm':'application/wasm'}[extname(file)]||'application/octet-stream');createReadStream(file).pipe(response);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--enable-unsafe-swiftshader']});
await mkdir(evidence,{recursive:true});
const report=[];
let activePage,activeErrors=[];
try{
 for(const id of [1,2]){
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
  activePage=page;activeErrors=errors;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text());});
  await page.addInitScript(()=>window.addEventListener('message',event=>{if(event.data?.type==='biomero-ng-error')console.error('NEUROGLANCER_ERROR: '+event.data.message);}));
  const saved=encodeURIComponent(JSON.stringify([{index:0,visible:true,color:'#FFFFFF',low:0,high:255}]));
  await page.goto(`http://127.0.0.1:${server.address().port}/?image=${id}&v=2&render=3d&channels=${saved}`);
  await page.getByText('3D image and labels ready',{exact:true}).waitFor({timeout:60000});
  const capture=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
   const id=Math.random(),timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('Capture timed out'));},10000);
   const receive=event=>{if(event.data?.type!=='biomero-ng-capture'||event.data.id!==id)return;clearTimeout(timer);window.removeEventListener('message',receive);
    if(event.data.error){reject(Error(event.data.error));return;}
    const {width,height,data}=event.data,bytes=new Uint8Array(data);
    resolve({width,height,probes:[[.5,.5],[.25,.25],[.75,.25],[.75,.75]].map(([x,y])=>Array.from(bytes.slice(((Math.floor(y*height)+8)*width+Math.floor(x*width)+8)*4,((Math.floor(y*height)+8)*width+Math.floor(x*width)+8)*4+3))),bright:bytes.filter((value,index)=>index%4===0&&value>100).length});
   };
   window.addEventListener('message',receive);document.querySelector('iframe').contentWindow.postMessage({type:'biomero-ng-capture',id},location.origin);
  }));
  await page.waitForTimeout(700);const volume=await capture();if(volume.bright<100)throw Error('Volume did not render');
  await page.getByText('Clipping planes',{exact:true}).click();await page.getByLabel('X clipping minimum',{exact:true}).press('End');
  await page.waitForTimeout(700);const clipped=await capture();if(clipped.bright!==0)throw Error('Volume clipping did not exclude the empty range');
  for(const layout of ['Slice','Orthogonal']){
   await page.getByRole('group',{name:'Volume view',exact:true}).getByRole('button',{name:layout,exact:true}).click();
   await page.getByText(layout==='Slice'?'Slice ready':'Orthogonal views ready',{exact:true}).waitFor({timeout:60000});
   await page.waitForTimeout(700);const image=await capture(),indices=layout==='Slice'?[0]:[1,2,3];
   await page.screenshot({path:resolve(evidence,`neuroglancer-${id}-${layout.toLowerCase()}.png`)});
   for(const index of indices)if(image.probes[index].some(value=>value<200))throw Error(`${id} ${layout}: expected a bright section, got ${JSON.stringify(image.probes)}`);
   report.push({transport:id===1?'native-zarr':'decoded-chunks',layout,probes:image.probes});
  }
  if(errors.length)throw Error(JSON.stringify(errors));await page.close();
 }
 await writeFile(resolve(evidence,'neuroglancer-sections.json'),JSON.stringify(report,null,2));
 console.log('Neuroglancer section pixels and volume clipping passed for native Zarr and decoded chunks.');
}catch(error){
 if(activePage&&!activePage.isClosed()){
  await activePage.screenshot({path:resolve(evidence,'neuroglancer-sections-failure.png')});
  console.error(JSON.stringify({error:String(error),pageErrors:activeErrors,body:await activePage.locator('body').innerText()}));
 }
 throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
