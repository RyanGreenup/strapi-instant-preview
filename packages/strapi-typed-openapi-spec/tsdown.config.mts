import { defineConfig } from "tsdown";

export default defineConfig({
  // Preserve the plugin, CLI and library entry paths used by package.json.
  entry: ["server/src/**/*.ts"],
  copy: [
    {
      from: "server/src/tooling/templates/*.ts.template",
      to: "dist/server/src/tooling/templates",
    },
  ],
  root: ".",
  unbundle: true,
  format: ["cjs"],
  platform: "node",
  target: "node22",
  dts: { generator: "tsgo" },
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
