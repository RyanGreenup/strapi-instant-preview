import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const strapiRequire = createRequire(
  require.resolve("@strapi/strapi/package.json"),
);
const adminRoot = dirname(strapiRequire.resolve("@strapi/admin/package.json"));
const contentManagerRoot = dirname(
  require.resolve("@strapi/content-manager/package.json"),
);

const rulesEngine = join(
  adminRoot,
  "dist/admin/admin/src/utils/rulesEngine.mjs",
);

export default defineConfig({
  resolve: {
    alias: {
      // Use the real rules engine without loading Strapi's browser-only admin barrel in Node.
      "@strapi/strapi/admin": rulesEngine,
      // Strapi's own Save filter imports the engine under this name.
      "@strapi/admin/strapi-admin": rulesEngine,
      // Resolve the public re-export to its real implementation without the admin UI barrel.
      "@strapi/content-manager/strapi-admin": join(
        contentManagerRoot,
        "dist/admin/utils/api.mjs",
      ),
    },
  },
  test: {
    // Apply the aliases inside Strapi's build, which omitInvisibleFields.test.ts loads.
    server: { deps: { inline: [/@strapi\/content-manager/u] } },
  },
});
