import type { UserConfig } from "tsdown";

import { defineConfig } from "tsdown";

/**
 * Builds one entry as ESM and CommonJS with matching declarations.
 *
 * @param name Source and output directory of the entry.
 * @param platform Runtime the entry targets.
 * @returns The tsdown options for that entry.
 */
const entry = (name: string, platform: "browser" | "node"): UserConfig => ({
  entry: [`${name}/src/index.ts`],
  outDir: `dist/${name}`,
  format: ["esm", "cjs"],
  platform,
  inputOptions: { platform },
  tsconfig: "tsconfig.json",
  dts: { generator: "tsgo" },
  outExtensions: ({ format }) => ({
    js: format === "es" ? ".mjs" : ".js",
    dts: format === "es" ? ".d.mts" : ".d.ts",
  }),
});

export default defineConfig([
  // Preview page bridge for the frontend browser.
  entry("client", "browser"),
  // Signing and verification for the Strapi and frontend servers.
  entry("server", "node"),
]);
