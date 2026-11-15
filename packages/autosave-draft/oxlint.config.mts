import { base } from "@rs/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  rules: {
    // The typed rule also accepts async functions that forward a promise.
    "require-await": "off",
    "typescript/require-await": "error",
    // Strapi's JSON values and React's empty render use null.
    "unicorn/no-null": "off",
    // React effects and event handlers start async work without returning its promise.
    "no-void": ["error", { allowAsStatement: true }],
  },
  overrides: [
    {
      // These adapters bridge Content Manager APIs whose public types omit their runtime shape.
      files: [
        "admin/src/index.ts",
        "admin/src/services/saveDraft.ts",
        "admin/src/hooks/**/*.ts",
      ],
      rules: {
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
    {
      // Strapi loads both plugin entries through their default exports.
      files: ["admin/src/index.ts", "server/src/index.ts"],
      rules: {
        "import/no-default-export": "off",
      },
    },
    {
      // Match the source plugin's helper and component names.
      files: ["admin/src/**/*.{ts,tsx}"],
      rules: {
        "unicorn/filename-case": [
          "error",
          { cases: { camelCase: true, pascalCase: true } },
        ],
      },
    },
  ],
});
