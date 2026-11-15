import { base } from "@rs/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  rules: {
    // The typed rule also accepts async functions that forward a promise.
    "require-await": "off",
    "typescript/require-await": "error",
  },
});
