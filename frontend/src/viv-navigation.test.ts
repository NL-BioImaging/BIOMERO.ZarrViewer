import { GentleDetailView, GentleVolumeView, gentleScrollZoom } from "./viv-navigation";

test("Viv 3D and sections use the same gentle wheel speed without competing camera animations", () => {
  const views = [new GentleVolumeView({id:"3d",width:400,height:300,target:[0,0,0],useFixedAxis:true}), new GentleDetailView({id:"xy",width:400,height:300})];
  for (const view of views) expect(view.getDeckGlView().props.controller).toEqual({scrollZoom:gentleScrollZoom});
  const volume=views[0] as GentleVolumeView;
  volume.orthographic=true;
  expect(volume.getDeckGlView().props.orthographic).toBe(true);
  expect(gentleScrollZoom.smooth).toBe(false);
  const factor=2/(1+Math.exp(-100*gentleScrollZoom.speed));
  expect(factor).toBeGreaterThan(1.1);
  expect(factor).toBeLessThan(1.13);
});
