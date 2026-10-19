import { defaultPlateFieldIndex } from './OverviewGrid';
import { parseDeepLink,writeDeepLink } from './viewer-state';

test('initial plate field is the middle field and explicit choices survive deep links',()=>{
  const capability={plate:{wells:[{fields:Array.from({length:9},(_,i)=>({path:`A/1/${i}`}))}]}};
  expect(defaultPlateFieldIndex(capability as any)).toBe(4);
  const url=writeDeepLink(42,{view:'plate',plateField:2,z:0,t:0});
  expect(parseDeepLink(new URL(url,'http://localhost').search).plateField).toBe(2);
});
