import { base } from "@rs/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  rules: {
    // The typed rule also accepts async functions that forward a promise.
    "require-await": "off",
    "typescript/require-await": "error",
  },
  overrides: [
    {
      // Strapi loads the admin plugin through its default export.
      files: ["admin/src/index.ts"],
      rules: {
        "import/no-default-export": "off",
      },
    },
    {
      // Strapi's admin scaffold uses camelCase helpers and PascalCase components.
      files: ["admin/src/**/*.{ts,tsx}"],
      rules: {
        "unicorn/filename-case": [
          "error",
          { cases: { camelCase: true, pascalCase: true } },
        ],
      },
    },
    {
      // An initializer renders nothing while registering the mounted plugin.
      files: ["admin/src/components/Initializer.tsx"],
      rules: {
        "unicorn/no-null": "off",
      },
    },
  ],
});
