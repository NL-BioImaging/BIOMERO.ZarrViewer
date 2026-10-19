import { viewerContextId } from './viewer-context';
test('view IDs work without the secure-context-only randomUUID API',()=>{
  const original=globalThis.crypto;
  vi.stubGlobal('crypto',{getRandomValues:original.getRandomValues.bind(original)});
  try{const a=viewerContextId(),b=viewerContextId();expect(a).toMatch(/^[0-9a-f]{32}$/);expect(b).not.toBe(a);}
  finally{vi.stubGlobal('crypto',original);}
});
