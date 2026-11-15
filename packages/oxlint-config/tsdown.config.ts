import { defineConfig } from "tsdown";

export default defineConfig({
  dts: {
    sourcemap: true,
    generator: "tsgo",
  },
  entry: {
    index: "./src/index.ts",
    "plugins/solid": "./src/plugins/solid.ts",
    "plugins/solid-ref-pattern": "./src/plugins/solid-ref-pattern/index.ts",
    "plugins/sonarjs": "./src/plugins/sonarjs.ts",
  },
  exports: {
    devExports: false,
    customExports: {
      // Keep declarations and their source maps inside the published dist.
      ".": {
        default: "./dist/index.mjs",
        types: "./dist/index.d.mts",
      },
      "./plugins/solid": {
        default: "./dist/plugins/solid.mjs",
        types: "./dist/plugins/solid.d.mts",
      },
      "./plugins/solid-ref-pattern": {
        default: "./dist/plugins/solid-ref-pattern.mjs",
        types: "./dist/plugins/solid-ref-pattern.d.mts",
      },
      "./plugins/sonarjs": {
        default: "./dist/plugins/sonarjs.mjs",
        types: "./dist/plugins/sonarjs.d.mts",
      },
      // The shared oxfmt config is a plain JSON file, not a build artifact, so
      // consumers point `oxfmt -c` straight at it.
      "./oxfmt.json": "./oxfmt.json",
      "./package.json": "./package.json",
    },
  },
});
