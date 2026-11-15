import { defineConfig } from "oxlint";

export const funcStyle = defineConfig({
  plugins: ["typescript", "unicorn", "oxc"],
  categories: {
    correctness: "error",
  },
  env: {
    builtin: true,
  },
  overrides: [
    // Prefer declarations for reusable named functions and arrows for closures
    // and callbacks. Disallow function expressions assigned to variables.
    {
      files: ["**/*.ts"],

      rules: {
        "func-style": [
          "error",
          "declaration",
          {
            allowArrowFunctions: true,
            allowTypeAnnotation: false,
          },
        ],

        "prefer-arrow-callback": [
          "error",
          {
            allowNamedFunctions: false,
            allowUnboundThis: true,
          },
        ],
      },
    },
    // Apply the same convention to TSX, where typed component arrows are common.
    {
      files: ["**/*.tsx"],
      rules: {
        "func-style": [
          "error",
          "declaration",
          {
            allowArrowFunctions: true,
            allowTypeAnnotation: false,
          },
        ],

        "prefer-arrow-callback": [
          "error",
          {
            allowNamedFunctions: false,
            allowUnboundThis: true,
          },
        ],
      },
    },
  ],
});
