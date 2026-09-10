import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import { stringify } from "yaml";
import pluginConfig from "./src/plugin.config";

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: { isCustomElement: (tag) => tag.startsWith("cider-") },
      },
    }),
    cssInjectedByJsPlugin(),
    {
      name: "cider-plugin-manifest",
      apply: "build",
      buildStart() {
        this.emitFile({ fileName: "plugin.yml", type: "asset", source: stringify(pluginConfig) });
        this.emitFile({
          fileName: "icon.png",
          type: "asset",
          source: readFileSync(fileURLToPath(new URL("./public/icon.png", import.meta.url))),
        });
        this.emitFile({
          fileName: "THIRD_PARTY_LICENSES.txt",
          type: "asset",
          source: readFileSync(fileURLToPath(new URL("./public/THIRD_PARTY_LICENSES.txt", import.meta.url))),
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      lodash: "lodash-es",
      ...(process.env.VITEST ? { "@ciderapp/pluginkit": fileURLToPath(new URL("./tests/pluginkit-stub.ts", import.meta.url)) } : {}),
    },
  },
  publicDir: false,
  build: {
    outDir: "dist",
    target: ["es2022", "chrome108"],
    minify: "esbuild",
    lib: { entry: "src/main.ts", fileName: "plugin", formats: ["es"] },
    rollupOptions: {
      output: { chunkFileNames: "assets/[name]-[hash].js" },
    },
  },
  server: { host: "127.0.0.1", port: 3058, cors: true },
  define: {
    "process.env": JSON.stringify({ cider: "4" }),
    cplugin: JSON.stringify({ ce_prefix: "cnl", identifier: pluginConfig.identifier }),
  },
});
