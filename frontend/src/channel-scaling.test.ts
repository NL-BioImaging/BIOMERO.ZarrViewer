import { describe, expect, test } from "vitest";
import { analyzeChannels, applyChannelAnalysis, autoScaleChannels } from "./channel-scaling";
import type { ChannelState } from "./types";

const channel: ChannelState = {
  index: 0,
  label: "DNA",
  visible: true,
  color: "#FFFFFF",
  low: 0,
  high: 65535,
  domainMin: 0,
  domainMax: 65535,
};

describe("automatic channel scaling", () => {
  test("uses Viv percentile statistics from native pixels", async () => {
    const source = {
      labels: ["c", "y", "x"],
      shape: [1, 2, 3],
      tileSize: 256,
      getRaster: async () => ({ data: new Uint16Array([0, 10, 20, 30, 40, 1000]), width: 3, height: 2 }),
    };

    const [scaled] = await autoScaleChannels([source], [channel]);

    expect(scaled.low).toBe(10);
    expect(scaled.high).toBe(1000);

    const [analysis] = await analyzeChannels([source], [channel]);
    expect(analysis.histogram).toHaveLength(48);
    expect(analysis.histogram.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });

  test("keeps metadata defaults when a sample has no usable range", async () => {
    const source = {
      labels: ["c", "y", "x"],
      shape: [1, 2, 2],
      tileSize: 256,
      getRaster: async () => ({ data: new Uint16Array(4), width: 2, height: 2 }),
    };

    expect(await autoScaleChannels([source], [channel])).toEqual([channel]);
  });

  test("applies sampled fit limits independently of automatic contrast", () => {
    const [scaled] = applyChannelAnalysis([channel], [{
      index: 0,
      autoLow: 10,
      autoHigh: 200,
      fitLow: 2,
      fitHigh: 900,
      histogram: [],
    }], "fit");

    expect(scaled).toMatchObject({ low: 2, high: 900 });
  });
});


test("pyramid averaging cannot replace native-resolution contrast", async () => {
  const native = { labels: ["c", "y", "x"], shape: [1, 2, 3],
    getRaster: vi.fn(async () => ({ data: new Uint16Array([0, 100, 500, 1000, 4000, 20000]) })) };
  const coarse = { ...native, getRaster: vi.fn(async () => ({ data: new Uint16Array([0, 20, 30, 40]) })) };
  const [scaled] = await autoScaleChannels([native, coarse], [channel]);
  expect(scaled.high).toBe(20000);
  expect(native.getRaster).toHaveBeenCalledOnce();
  expect(coarse.getRaster).not.toHaveBeenCalled();
});

test.each([
  new Int16Array([-100,-20,0,10,200]),
  new Float32Array([.01,.02,.05,.1,.15]),
  new Float32Array([NaN,-Infinity,Infinity,.02,.1]),
  new Float32Array([42,42,42]),
])("signed, float, non-finite and constant samples produce useful finite ranges: %j",async data=>{
  const source={labels:["y","x"],shape:[1,data.length],getRaster:async()=>({data})};
  const [analysis]=await analyzeChannels([source],[channel]);
  expect(analysis.status).toBe("ready");expect(Number.isFinite(analysis.autoLow)).toBe(true);expect(analysis.autoHigh).toBeGreaterThan(analysis.autoLow);
  if(data[0]===.01)expect(analysis.fitHigh).toBeLessThan(1);
});

test.each([new Float32Array(),new Float32Array([NaN,Infinity])])("empty or entirely non-finite samples preserve contrast without crashing",async data=>{
  const [analysis]=await analyzeChannels([{labels:["x","y"],shape:[2,1],getRaster:async()=>({data})}],[channel]);
  expect(analysis.status).toBe("error");expect(applyChannelAnalysis([channel],[analysis])[0]).toEqual(channel);
});

test("volume analysis samples at most five native Z positions and 262144 pixels without preparing a volume",async()=>{
  const getVolume=vi.fn(),getTile=vi.fn(async()=>({data:new Uint16Array(512*512).fill(200)}));
  const source={labels:["c","z","y","x"],shape:[1,101,4096,4096],tileSize:512,getVolume,getTile};
  const [analysis]=await analyzeChannels([source],[channel],0,0,{volume:true});
  expect(getVolume).not.toHaveBeenCalled();expect(getTile.mock.calls.length).toBeLessThanOrEqual(16);
  const zs=new Set(getTile.mock.calls.map((call:any)=>call[0].selection.z));expect(zs.size).toBeLessThanOrEqual(5);expect(zs.has(0)&&zs.has(100)).toBe(true);
  expect(analysis.histogram.reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(262144);
});

test("cancelling statistics stops subsequent Z samples",async()=>{
  const controller=new AbortController();
  const getRaster=vi.fn(async()=>{controller.abort();return {data:new Uint16Array([1,2])};});
  await expect(analyzeChannels([{labels:["z","y","x"],shape:[5,1,2],getRaster}],[channel],0,0,{volume:true,signal:controller.signal})).rejects.toMatchObject({name:"AbortError"});
  expect(getRaster).toHaveBeenCalledOnce();
});
