export function labelIdColor(labelId: number): [number, number, number] {
  let value = Math.max(0, Math.floor(labelId)) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value = (value ^ (value >>> 15)) >>> 0;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255];
}

