import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MovieExport, TimePlayback } from "./MovieControls";
import type { MovieRecipe } from "./movie-recipe";
import { useState } from 'react';
import { exportMovie } from './movie-renderer';
vi.mock('./movie-renderer',async original=>({...await original<any>(),exportMovie:vi.fn()}));

test('movie export has an icon-only trigger with an accessible name and tooltip',()=>{
  const recipe={panels:[{field:'.',roi:[0,0,32,32]}]} as MovieRecipe;
  render(<MovieExport imageId={42} sizeT={4} recipe={recipe}/>);
  const button=screen.getByRole('button',{name:'Export movie'});
  expect(button).toHaveAttribute('title','Export movie');
  expect(button.textContent).toBe('');expect(button.querySelector('svg')).toHaveAttribute('aria-hidden','true');
  fireEvent.click(button);expect(button).toHaveAttribute('aria-expanded','true');
  expect(screen.getByRole('region',{name:'Export movie'})).toBeInTheDocument();
});

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

test.each(['2D','3D'])("cancelling a %s export restores controls even with its panel closed",async mode=>{
  const onBusy=vi.fn(),exporter=vi.fn((_recipe:MovieRecipe,signal:AbortSignal)=>new Promise<any>((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new DOMException('signal is aborted without reason','AbortError')),{once:true});
  }));
  const recipe:MovieRecipe={sequence:{version:1,start:0,end:3,fps:5},viewCapture:{version:1,space:'screen',renderer:'viv',mode:'orthogonal',quality:0,settings:{}},
    panels:[{field:'.',roi:[0,0,512,256],sourceChannels:[1],z:0,t:0,overlays:[]}]};
  vi.mocked(exportMovie).mockImplementation(exporter as any);
  render(<MovieExport imageId={42} sizeT={4} recipe={recipe} exporter={mode==='3D'?exporter:undefined} onBusy={onBusy}/>);
  fireEvent.click(screen.getByRole('button',{name:'Export movie'}));fireEvent.click(screen.getByRole('button',{name:'Create MP4'}));
  expect(onBusy).toHaveBeenLastCalledWith(true);expect(screen.getByRole('spinbutton',{name:'Last frame'})).toBeDisabled();
  // Closing the options must not hide or disable cancellation.
  fireEvent.click(screen.getByRole('button',{name:'Export movie'}));
  expect(screen.queryByRole('region',{name:'Export movie'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cancel movie export'}));
  await waitFor(()=>expect(onBusy).toHaveBeenLastCalledWith(false));
  fireEvent.click(screen.getByRole('button',{name:'Export movie'}));
  expect(screen.getByRole('status')).toHaveTextContent('Movie export cancelled.');
  expect(onBusy).toHaveBeenLastCalledWith(false);expect(screen.getByRole('button',{name:'Create MP4'})).toBeEnabled();expect(exporter).toHaveBeenCalledOnce();
});

test('a cancelled export cannot offer a late completed movie for download',async()=>{
  let finish!:(value:any)=>void;
  const exporter=vi.fn(()=>new Promise<any>(resolve=>{finish=resolve;}));
  const recipe={sequence:{version:1,start:0,end:3,fps:5},panels:[{field:'.',roi:[0,0,32,32]}]} as MovieRecipe;
  render(<MovieExport imageId={42} sizeT={4} recipe={recipe} exporter={exporter}/>);
  fireEvent.click(screen.getByRole('button',{name:'Export movie'}));
  fireEvent.click(screen.getByRole('button',{name:'Create MP4'}));
  fireEvent.click(screen.getByRole('button',{name:'Cancel movie export'}));
  expect(screen.getByRole('button',{name:'Cancel movie export'})).toBeDisabled();
  await act(async()=>finish({data:new ArrayBuffer(0),poster:new ArrayBuffer(0),provenance:{frameCount:4}}));
  expect(screen.getByRole('status')).toHaveTextContent('Movie export cancelled.');
  expect(screen.queryByRole('button',{name:'Download MP4'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Create MP4'})).toBeEnabled();
});


test('movie export defaults to all available frames up to 2000', () => {
  const recipe={panels:[{field:'.',roi:[0,0,32,32]}]} as MovieRecipe;
  render(<MovieExport imageId={42} sizeT={2500} recipe={recipe}/>);
  fireEvent.click(screen.getByRole('button',{name:'Export movie'}));
  expect(screen.getByLabelText('Last frame')).toHaveValue(2000);
  expect(screen.getByText(/Maximum 2000 frames/)).toBeInTheDocument();
});
