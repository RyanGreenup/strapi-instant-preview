import { defineConfig } from "tsdown";

export default defineConfig([
  {
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
  },
  {
    entry: ["server/src/index.ts"],
    outDir: "dist/server",
    format: ["cjs"],
    platform: "node",
    tsconfig: "tsconfig.json",
    dts: { generator: "tsgo" },
    outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
  },
]);
