import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  // Strapi loads a plugin's server entry with `require`, and only if its
  // extension is `.js`.
  format: ["cjs"],
  dts: { generator: "tsgo" },
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
