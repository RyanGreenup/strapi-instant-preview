import { defineConfig } from "tsdown";

export default defineConfig({
  // Strapi loads the plugin with require(). The bin script and the tests load
  // modules by their path under dist/server/src, so keep one output file per
  // source file and keep the source layout.
  entry: ["server/src/**/*.ts"],
  root: ".",
  unbundle: true,
  format: ["cjs"],
  platform: "node",
  target: "node22",
  dts: { generator: "tsgo" },
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
