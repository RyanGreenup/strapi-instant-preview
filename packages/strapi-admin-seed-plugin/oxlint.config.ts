import { base } from "@moworks/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  rules: {
    // Strapi is typed structurally, so its services are cast from `unknown`.
    "typescript/no-unsafe-type-assertion": "off",
    // The secrets are read from the environment at run time.
    "node/no-process-env": "off",
    // The Strapi database stores and returns null.
    "unicorn/no-null": "off",
  },
  overrides: [
    {
      files: ["src/index.ts"],
      // Strapi loads the default export of a plugin's server entry.
      rules: { "import/no-default-export": "off" },
    },
  ],
});
