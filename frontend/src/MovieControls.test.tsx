import { act, fireEvent, render, screen } from "@testing-library/react";
import { TimePlayback } from "./MovieControls";

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
