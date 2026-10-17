import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

const neuroglancerPlugin = (): Plugin => ({
    name: "neuroglancer-vite-workers",
    enforce: "pre",
    transform(code, id) {
      if (id.endsWith("/neuroglancer/lib/chunk_worker.bundle.js")) {
        code = `import ${JSON.stringify(resolve(__dirname, "src/browser-mesh-store.ts").replace(/\\/g, "/"))};\n` + code;
      }
      // Vite 7 does not recognize new Worker(new URL(...)) with webpack's
      // chunk-name comment between the parentheses and URL constructor.
      if (id.includes("/neuroglancer/lib/")) return code.replace(/\/\* webpackChunkName: [^*]*\*\//g, "");
    },
});

export default defineConfig({
  plugins: [neuroglancerPlugin()],
  root: resolve(__dirname, "neuroglancer"),
  base: "./",
  resolve: {
    // Use published Ikonate assets; these three names only exist in its Git tree.
    alias: [
      { find: /^ikonate\/icons\/controls-alt\.svg/, replacement: resolve(__dirname, "node_modules/ikonate/icons/controls.svg") },
      { find: /^ikonate\/icons\/code-alt\.svg/, replacement: resolve(__dirname, "node_modules/ikonate/icons/settings.svg") },
      { find: /^ikonate\/icons\/layers\.svg/, replacement: resolve(__dirname, "node_modules/ikonate/icons/stack.svg") },
    ],
    conditions: ["neuroglancer/datasource:none_by_default", "neuroglancer/datasource/precomputed:enabled", "neuroglancer/datasource/zarr:enabled", "neuroglancer/layer:none_by_default", "neuroglancer/layer/image:enabled", "neuroglancer/layer/segmentation:enabled"],
  },
  worker: { format: "es", plugins: () => [neuroglancerPlugin()] },
  build: {
    outDir: resolve(__dirname, "../src/biomero_zarr_viewer/static/biomero_zarr_viewer/neuroglancer"),
    emptyOutDir: false,
    chunkSizeWarningLimit: 4096,
  },
});
