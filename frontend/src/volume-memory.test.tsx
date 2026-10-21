import {afterEach,expect,test,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {estimateVramMiB,memoryOptions,useVolumeMemory,VolumeMemoryControls,MIB} from './volume-memory';
import {volumeLevels} from './volume-utils';

afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals();});
test('per-device-pixel calibration scales by DPR squared, with bounded invalid inputs',()=>{
  expect(estimateVramMiB(1920,1080,1)).toBe(1024);
  expect(estimateVramMiB(1920,1080,2)).toBe(4096);
  expect(estimateVramMiB(960,540,1)).toBe(256);
  expect(estimateVramMiB(1,1,1)).toBe(128);
  expect(estimateVramMiB(NaN,1080,1)).toBe(1024);
});
test('four choices on larger budgets, three on small budgets; 75% rounds down',()=>{
  expect(memoryOptions(1024).map(o=>o.mib)).toEqual([100,200,500,760]);
  expect(memoryOptions(256).map(o=>o.mib)).toEqual([100,200,190]);
  expect(memoryOptions(667).map(o=>o.value)).toEqual(['100','200','auto']);
  expect(memoryOptions(680).map(o=>o.value)).toEqual(['100','200','500','auto']);
});
function Controls(){const memory=useVolumeMemory();return <><VolumeMemoryControls memory={memory}/><output data-testid="bytes">{memory.budgetBytes}</output></>;}
test('choice persists locally and automatic tracks window resizes',()=>{
  vi.useFakeTimers();vi.stubGlobal('innerWidth',1920);vi.stubGlobal('innerHeight',1080);vi.stubGlobal('devicePixelRatio',1);
  const first=render(<Controls/>);
  expect(screen.getByLabelText('Max VRAM')).toHaveValue('200');
  fireEvent.change(screen.getByLabelText('Max VRAM'),{target:{value:'auto'}});
  expect(screen.getByTestId('bytes').textContent).toBe(String(760*MIB));
  first.unmount();render(<Controls/>);
  expect(screen.getByLabelText('Max VRAM')).toHaveValue('auto');
  vi.stubGlobal('innerWidth',960);vi.stubGlobal('innerHeight',540);
  act(()=>{window.dispatchEvent(new Event('resize'));vi.advanceTimersByTime(151);});
  expect(screen.getByTestId('bytes').textContent).toBe(String(190*MIB));
  expect(screen.getByLabelText('Max VRAM').querySelectorAll('option')).toHaveLength(3);
  vi.unstubAllGlobals();
});
test('blocked storage retains working controls in the current tab',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('disabled');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('disabled');});
  vi.stubGlobal('innerWidth',960);vi.stubGlobal('innerHeight',540);vi.stubGlobal('devicePixelRatio',1);
  render(<Controls/>);
  fireEvent.change(screen.getByLabelText('Max VRAM'),{target:{value:'100'}});
  expect(screen.getByTestId('bytes').textContent).toBe(String(100*MIB));
  vi.unstubAllGlobals();
});
test('stored 500 MiB falls back when that option is unavailable',()=>{
  localStorage.setItem('biomero-zarr-viewer.max-vram-mib','500');
  vi.stubGlobal('innerWidth',960);vi.stubGlobal('innerHeight',540);vi.stubGlobal('devicePixelRatio',1);
  render(<Controls/>);
  expect(screen.getByLabelText('Max VRAM')).toHaveValue('200');
});
test('GPU eligibility accounts for Float32 upload and every visible channel',()=>{
  const source={labels:['c','z','y','x'],shape:[2,64,1024,1024],dtype:'Uint8'};
  expect(volumeLevels([source],1,2048,500*MIB,200*MIB)[0]).toMatchObject({rawBytes:64*MIB,gpuBytes:256*MIB,safe:false});
  expect(volumeLevels([source],1,2048,500*MIB,500*MIB)[0].safe).toBe(true);
  expect(volumeLevels([source],2,2048,500*MIB,500*MIB)[0].safe).toBe(false);
});

test('manual GPU VRAM gives exact 75% above 32-bit sizes and persists independently',()=>{
  vi.useFakeTimers();vi.stubGlobal('innerWidth',1920);vi.stubGlobal('innerHeight',1080);vi.stubGlobal('devicePixelRatio',1);
  const first=render(<Controls/>);
  expect(screen.getByLabelText('GPU VRAM')).toHaveValue('estimate');
  expect([...screen.getByLabelText('GPU VRAM').querySelectorAll('option')].map(o=>o.textContent)).toEqual(['Estimate (1 GiB)','2 GiB','4 GiB','8 GiB','12 GiB','16 GiB','24 GiB','48 GiB']);
  fireEvent.change(screen.getByLabelText('GPU VRAM'),{target:{value:'24'}});
  fireEvent.change(screen.getByLabelText('Max VRAM'),{target:{value:'auto'}});
  expect(screen.getByTestId('bytes').textContent).toBe(String(18*1024*MIB));
  expect(screen.getByRole('option',{name:'18 GiB (75%)'})).toBeInTheDocument();
  first.unmount();render(<Controls/>);
  expect(screen.getByLabelText('GPU VRAM')).toHaveValue('24');
  expect(screen.getByLabelText('Max VRAM')).toHaveValue('auto');
  vi.stubGlobal('innerWidth',960);vi.stubGlobal('innerHeight',540);
  act(()=>{window.dispatchEvent(new Event('resize'));vi.advanceTimersByTime(151);});
  expect(screen.getByTestId('bytes').textContent).toBe(String(18*1024*MIB));
  fireEvent.change(screen.getByLabelText('GPU VRAM'),{target:{value:'48'}});
  expect(screen.getByTestId('bytes').textContent).toBe(String(36*1024*MIB));
  fireEvent.change(screen.getByLabelText('GPU VRAM'),{target:{value:'estimate'}});
  expect(screen.getByTestId('bytes').textContent).toBe(String(190*MIB));
  expect(screen.queryByText(/Estimated VRAM budget|Window-based estimate/)).not.toBeInTheDocument();
});
