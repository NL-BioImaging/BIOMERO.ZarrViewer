import { channelBatches, MultiplexDetailView } from './multiplex-views';

test('27-channel sources bind only visible channels and keep indices aligned',()=>{
  const source=Array.from({length:27},(_,index)=>index),loaded=vi.fn();
  const props={selections:source.map(c=>({c})),colors:source.map(c=>[c,c,c]),contrastLimits:source.map(c=>[c,c+100]),channelsVisible:source.map(i=>i===0||i===26),onBatchViewportLoad:loaded};
  const [batch]=channelBatches(props);
  expect(batch.selections).toEqual([{c:0},{c:26}]);expect(batch.colors).toEqual([[0,0,0],[26,26,26]]);expect(batch.contrastLimits).toEqual([[0,100],[26,126]]);
  batch.onViewportLoad();expect(loaded).toHaveBeenCalledWith(0);
});

test('all 27 channels composite in bounded draws and report every batch',()=>{
  const channels=Array.from({length:27},(_,c)=>({c})),ready=vi.fn();
  const props={selections:channels,colors:channels.map(()=>[255,0,0]),contrastLimits:channels.map(()=>[0,255]),channelsVisible:channels.map(()=>true),onBatchViewportLoad:ready};
  const batches=channelBatches(props);expect(batches.map(b=>b.selections.length)).toEqual([10,10,7]);
  expect(batches.flatMap(b=>b.selections)).toEqual(channels);expect(batches[1].parameters.blendColorDstFactor).toBe('one');
  batches.forEach(b=>b.onViewportLoad());expect(ready.mock.calls).toEqual([[0],[1],[2]]);
  expect(channelBatches({...props,channelsVisible:channels.map(()=>false)})).toEqual([]);
  const view=new MultiplexDetailView({id:'detail',width:600,height:500});
  const layers=view.getLayers({props:{...props,loader:[{shape:[27,64,64],labels:['c','y','x']}]}});
  expect(new Set(layers.map((l:any)=>l.id)).size).toBe(3);expect(layers.every((l:any)=>l.id.includes('#detail#'))).toBe(true);
});
