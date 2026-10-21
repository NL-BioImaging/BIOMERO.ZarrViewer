import {fireEvent,render,screen} from '@testing-library/react';
import {useState} from 'react';
import {ClippingPlanes} from './ClippingPlanes';
import {fullClipping,physicalClipBounds,neuroglancerClipShader} from './clipping';
import {VolumeControls} from './App';
function Panel(){const [bounds,set]=useState(fullClipping);return <ClippingPlanes bounds={bounds} onChange={set}/>;}
test('clipping is collapsed by default, constrains double handles and resets only its axis',()=>{
  const {container}=render(<Panel/>);expect(container.querySelector('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('Clipping planes'));expect(container.querySelector('details')).toHaveAttribute('open');
  fireEvent.change(screen.getByLabelText('X clipping minimum'),{target:{value:'45'}});
  fireEvent.change(screen.getByLabelText('X clipping maximum'),{target:{value:'20'}});
  expect(screen.getByLabelText('X clipping maximum')).toHaveValue('45');
  fireEvent.change(screen.getByLabelText('Y clipping minimum'),{target:{value:'30'}});
  fireEvent.click(screen.getByLabelText('Reset X clipping'));expect(screen.getByLabelText('X clipping minimum')).toHaveValue('1');
  expect(screen.getByLabelText('Y clipping minimum')).toHaveValue('30');
  expect(screen.getAllByText('1–100 / 100').length).toBeGreaterThan(0);
});
test('both renderers expose clipping only in Volume view',()=>{
  const props={sizeT:1,t:0,onT:()=>{},levels:[],onLevel:()=>{},clipping:fullClipping(),onClipping:()=>{}};
  const {rerender}=render(<VolumeControls {...props} renderer="neuroglancer" view="3d"/>);
  expect(screen.getByText('Clipping planes')).toBeInTheDocument();
  rerender(<VolumeControls {...props} renderer="classic" view="3d"/>);expect(screen.getByText('Clipping planes')).toBeInTheDocument();
  for(const view of ['slice','orthogonal'] as const){rerender(<VolumeControls {...props} view={view}/>);expect(screen.queryByText('Clipping planes')).not.toBeInTheDocument();}
});
test('clipping composes shape, calibration and origin without changing slice shaders',()=>{
  const bounds=fullClipping();bounds[0]=[.25,.75];
  expect(physicalClipBounds([10,20,40],[2,3,4],[7,8,9],bounds)).toEqual([[27,8,9],[67,68,49]]);
  expect(neuroglancerClipShader([10,20,40])).toContain('vec3(40.00000000,20.00000000,10.00000000)');
  expect(neuroglancerClipShader([10,20,40])).toContain('if (VOLUME_RENDERING) {');
  expect(physicalClipBounds([1,1,1],[1,1,1],[0,0,0],fullClipping())).toBeUndefined();
});
