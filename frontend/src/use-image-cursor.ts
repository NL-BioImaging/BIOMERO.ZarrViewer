import { useCallback, useRef } from 'react';
import { imageAction, installImageCursor, type ImageInteraction } from './image-cursor';
export function useImageCursor(kind:ImageInteraction) {
  const dispose=useRef<(()=>void)|undefined>(undefined);
  return useCallback((node:HTMLDivElement|null)=>{
    dispose.current?.();
    dispose.current=node?installImageCursor(node,input=>imageAction(kind,input)).dispose:undefined;
  },[kind]);
}
