import { fireEvent } from '@testing-library/react';
import { imageAction, imageCursor, installImageCursor, type CursorInput } from './image-cursor';
import { getDefaultPerspectivePanelBindings, getDefaultSliceViewPanelBindings } from 'neuroglancer/unstable/ui/default_input_event_bindings.js';
import { configureSliceWheel, configureVolumeWheel } from './neuroglancer-controls';
const input=(values:Partial<CursorInput>={}):CursorInput=>({ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,buttons:0,target:null,...values});

test('Viv shows zoom at rest and the actual pan/rotation operation on mouse down',()=>{
  expect(imageAction('viv-2d',input())).toBe('zoom');
  expect(imageAction('viv-2d',input({buttons:1}))).toBe('pan');
  expect(imageAction('viv-2d',input({ctrlKey:true,buttons:1}))).toBe('none');
  expect(imageAction('viv-volume',input())).toBe('zoom');
  expect(imageAction('viv-volume',input({buttons:1}))).toBe('rotate');
  expect(imageAction('viv-volume',input({buttons:2}))).toBe('pan');
  for(const modifier of ['ctrlKey','altKey','metaKey','shiftKey']) {
    expect(imageAction('viv-volume',input({[modifier]:true}))).toBe('pan');
    expect(imageAction('viv-volume',input({[modifier]:true,buttons:1}))).toBe('pan');
  }
  expect(imageCursor('pan',true)).toBe('grabbing');expect(imageCursor('zoom')).toContain('data:image/svg+xml');
});

test('Neuroglancer cursors read the real bindings, including modified wheel and annotation bindings',()=>{
  const volume=getDefaultPerspectivePanelBindings(),section=getDefaultSliceViewPanelBindings();
  configureVolumeWheel(volume);configureSliceWheel(section);
  const action=(map:typeof volume,value:Partial<CursorInput>)=>imageAction('neuroglancer',input(value),id=>(map.get(id)||map.get(id.replace('at:','bubble:')))?.action);
  expect(action(volume,{})).toBe('zoom');expect(action(section,{})).toBe('zoom');
  expect(action(volume,{ctrlKey:true})).toBe('depth');
  expect(action(section,{ctrlKey:true})).toBe('slice');expect(action(section,{shiftKey:true})).toBe('slice');
  expect(action(volume,{altKey:true})).toBe('depth');
  expect(action(volume,{buttons:1})).toBe('rotate');expect(action(volume,{shiftKey:true,buttons:1})).toBe('pan');
  expect(action(section,{buttons:1})).toBe('pan');expect(action(section,{shiftKey:true,buttons:1})).toBe('rotate');
  expect(action(section,{buttons:2})).toBe('pan');expect(action(volume,{buttons:2})).toBe('pan');expect(action(volume,{ctrlKey:true,buttons:1})).toBe('select');
});

test('stationary pointer updates with modifier keys; a drag keeps its starting binding until release',()=>{
  const host=document.createElement('div');document.body.append(host);
  const cursor=installImageCursor(host,state=>imageAction('viv-volume',state));
  try {
    fireEvent(host,new MouseEvent('pointerenter',{bubbles:false}));
    expect(host.dataset.imageAction).toBe('zoom');
    fireEvent.keyDown(window,{key:'Shift',shiftKey:true});expect(host.dataset.imageAction).toBe('pan');
    fireEvent.keyUp(window,{key:'Shift'});expect(host.dataset.imageAction).toBe('zoom');
    fireEvent(host,new MouseEvent('pointerdown',{bubbles:true,buttons:1}));expect(host.dataset.imageAction).toBe('rotate');
    fireEvent.keyDown(window,{key:'Shift',shiftKey:true});expect(host.dataset.imageAction).toBe('rotate');
    fireEvent(window,new MouseEvent('pointerup',{buttons:0,shiftKey:true}));expect(host.dataset.imageAction).toBe('pan');
    fireEvent.blur(window);expect(host.dataset.imageAction).toBe('zoom');
    cursor.dispose();expect(host.dataset.imageAction).toBeUndefined();expect(host.style.getPropertyValue('--image-cursor')).toBe('');
    fireEvent.keyDown(window,{key:'Shift',shiftKey:true});expect(host.dataset.imageAction).toBeUndefined();
  } finally {cursor.dispose();host.remove();}
});

test('parent-frame modifier messages update a stationary iframe cursor',()=>{
  const host=document.createElement('div');document.body.append(host);
  const cursor=installImageCursor(host,state=>state.ctrlKey?'slice':'zoom');
  fireEvent(host,new MouseEvent('pointerenter'));
  cursor.setModifiers(input({ctrlKey:true}));expect(host.dataset.imageAction).toBe('slice');
  cursor.setModifiers(input());expect(host.dataset.imageAction).toBe('zoom');
  cursor.dispose();host.remove();
});
