import type { PlateCapability } from "./types";

const FORMATS = [[2, 3], [3, 4], [4, 6], [6, 8], [8, 12], [16, 24], [32, 48]];

function rowIndex(name: string): number | undefined {
  if (!/^[A-Z]{1,2}$/i.test(name)) return undefined;
  return [...name.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

function rowName(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `A${String.fromCharCode(65 + index - 26)}`;
}

/** Fill unrecorded wells without relabelling a cropped plate as a new format. */
export function plateGeometry(plate: PlateCapability): PlateCapability {
  const wells = plate.wells.map((well) => ({
    ...well,
    row_index: rowIndex(plate.rows[well.row_index] || well.path.split("/")[0]) ?? well.row_index,
    column_index: /^\d+$/.test(plate.columns[well.column_index] || well.path.split("/")[1] || "")
      ? Number(plate.columns[well.column_index] || well.path.split("/")[1]) - 1 : well.column_index,
  }));
  const neededRows = Math.max(plate.rows.length, ...wells.map((well) => well.row_index + 1));
  const neededColumns = Math.max(plate.columns.length, ...wells.map((well) => well.column_index + 1));
  const format = FORMATS.find(([rows, columns]) => rows >= neededRows && columns >= neededColumns);
  // Do not discard coordinates from a nonstandard plate larger than supported formats.
  if (!format) return plate;
  return { ...plate, wells, rows: Array.from({ length: format[0] }, (_, i) => rowName(i)), columns: Array.from({ length: format[1] }, (_, i) => String(i + 1)) };
}
