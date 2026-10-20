import {Matrix4} from '@math.gl/core';
import {actualScaleProps,nonBinaryPyramid,ActualScaleOverviewLayer} from './pyramid-layers';

const source=(x:number,y:number)=>({labels:['c','y','x'],shape:[3,y,x],tileSize:1024,dtype:'Uint8',getRaster:()=>{}});
test('ordinary binary pyramids retain the existing Viv path, including rounded sizes',()=>{
  expect(nonBinaryPyramid([source(46000,32914),source(23000,16457),source(11500,8228)])).toBe(false);
});
test('native fourfold pyramids select a level by its real pixel footprint',()=>{
  const loader=[source(46000,32914),source(11500,8228),source(2875,2057)];
  expect(nonBinaryPyramid(loader)).toBe(true);
  const props={loader,modelMatrix:new Matrix4().scale([1,2,1])};
  for(const [zoom,index] of [[-6,2],[-3,1],[-1,0]]){
    const actual=actualScaleProps(props,zoom);
    expect(actual.loader).toEqual([loader[index]]);
    expect(actual.excludeBackground).toBe(true);
    const scale=actual.modelMatrix.getScale();
    expect(scale[0]*loader[index].shape[2]).toBeCloseTo(46000);
    expect(scale[1]*loader[index].shape[1]).toBeCloseTo(32914*2);
  }
  expect(props.modelMatrix.getScale()).toEqual([1,2,1]);
});
test('overview image spans the same world bounds as its viewport outline',()=>{
  const loader=[source(46000,32914),source(11500,8228),source(2875,2057)];
  const layer=new ActualScaleOverviewLayer({id:'overview',loader,overviewScale:.01,boundingBox:[[0,0],[1,0],[1,1]],zoom:0});
  const [image]=layer.renderLayers();
  const scale=image.props.modelMatrix.getScale();
  expect(scale[0]*2875).toBeCloseTo(46000*.01);
  expect(scale[1]*2057).toBeCloseTo(32914*.01);
});
