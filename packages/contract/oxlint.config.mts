import { base } from "@ryangreenup/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  overrides: [
    {
      // Fixtures mirror Strapi responses, which return null for empty fields.
      files: ["tests/**"],
      rules: { "unicorn/no-null": "off" },
    },
  ],
});
