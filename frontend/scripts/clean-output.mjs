import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(import.meta.dirname, "../../src/biomero_zarr_viewer/static/biomero_zarr_viewer");
for (const name of await readdir(output)) {
  if (!(name.startsWith("openwith-") && name.endsWith(".js"))) {
    await rm(resolve(output, name), { recursive: true, force: true });
  }
}
