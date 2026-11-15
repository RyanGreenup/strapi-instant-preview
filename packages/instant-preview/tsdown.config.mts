import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["admin/src/index.ts"],
  outDir: "dist/admin",
  format: ["esm", "cjs"],
  platform: "browser",
  inputOptions: { platform: "browser" },
  tsconfig: "tsconfig.json",
  dts: { generator: "tsgo" },
  outExtensions: ({ format }) => ({
    js: format === "es" ? ".mjs" : ".js",
    dts: format === "es" ? ".d.mts" : ".d.ts",
  }),
});
