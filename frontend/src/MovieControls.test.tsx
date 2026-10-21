import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MovieExport, TimePlayback } from "./MovieControls";
import type { MovieRecipe } from "./movie-recipe";
import { useState } from 'react';

test('controlled playback reports automatic stop and frame stepping',()=>{
  const changed=vi.fn();
  function Player(){
    const [playing,setPlaying]=useState(false),[t,onT]=useState(0);
    return <TimePlayback sizeT={2} t={t} onT={onT} playing={playing} onPlayingChange={value=>{changed(value);setPlaying(value);}}/>;
  }
  vi.useFakeTimers();
  try {
    render(<Player/>);
    fireEvent.click(screen.getByRole('checkbox',{name:'Loop'}));
    fireEvent.click(screen.getByRole('button',{name:'Play'}));
    expect(changed).toHaveBeenLastCalledWith(true);
    act(()=>vi.advanceTimersByTime(200));
    act(()=>vi.advanceTimersByTime(200));
    expect(changed).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button',{name:'Play'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Play'}));
    fireEvent.click(screen.getByRole('button',{name:'Previous frame'}));
    expect(changed).toHaveBeenLastCalledWith(false);
  } finally {vi.useRealTimers();}
});

test("playback waits for the current frame and never queues multiple loads",()=>{
  vi.useFakeTimers();
  try {
    const onT=vi.fn(), props={sizeT:4,t:0,onT,ready:true};
    const {rerender}=render(<TimePlayback {...props}/>);
    fireEvent.click(screen.getByRole("button",{name:"Play"}));
    act(()=>vi.advanceTimersByTime(2000));expect(onT).toHaveBeenCalledTimes(1);expect(onT).toHaveBeenLastCalledWith(1);
    rerender(<TimePlayback {...props} t={1} ready={false}/>);
    act(()=>vi.advanceTimersByTime(2000));expect(onT).toHaveBeenCalledTimes(1);
    rerender(<TimePlayback {...props} t={1} ready/>);
    act(()=>vi.advanceTimersByTime(2000));expect(onT).toHaveBeenCalledTimes(2);expect(onT).toHaveBeenLastCalledWith(2);
  } finally {vi.useRealTimers();}
});

test("stopping a 3D export restores the controls and reports a readable status",async()=>{
  const onBusy=vi.fn(),exporter=vi.fn((_recipe:MovieRecipe,signal:AbortSignal)=>new Promise<any>((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new DOMException('signal is aborted without reason','AbortError')),{once:true});
  }));
  const recipe:MovieRecipe={sequence:{version:1,start:0,end:3,fps:5},viewCapture:{version:1,space:'screen',renderer:'viv',mode:'orthogonal',quality:0,settings:{}},
    panels:[{field:'.',roi:[0,0,512,256],sourceChannels:[1],z:0,t:0,overlays:[]}]};
  render(<MovieExport imageId={42} sizeT={4} recipe={recipe} exporter={exporter} onBusy={onBusy}/>);
  fireEvent.click(screen.getByRole('button',{name:'Export movie'}));fireEvent.click(screen.getByRole('button',{name:'Create MP4'}));
  expect(onBusy).toHaveBeenLastCalledWith(true);expect(screen.getByRole('spinbutton',{name:'Last frame'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Stop'}));
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Movie export stopped.'));
  expect(onBusy).toHaveBeenLastCalledWith(false);expect(screen.getByRole('button',{name:'Create MP4'})).toBeEnabled();expect(exporter).toHaveBeenCalledOnce();
});
