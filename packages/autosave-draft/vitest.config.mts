import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const strapiRequire = createRequire(
  require.resolve("@strapi/strapi/package.json"),
);
const adminRoot = dirname(strapiRequire.resolve("@strapi/admin/package.json"));

export default defineConfig({
  resolve: {
    alias: {
      // Use the real rules engine without loading Strapi's browser-only admin barrel in Node.
      "@strapi/strapi/admin": join(
        adminRoot,
        "dist/admin/admin/src/utils/rulesEngine.mjs",
      ),
    },
  },
});
