import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

import jsxA11yJson from "../generated/recommended/jsx-a11y-recommended.json";
import { asConfig } from "../internal/as-config";
import { base } from "./base";

const jsxA11yRecommended: OxlintConfig = asConfig(jsxA11yJson);

/** Provides strict React and TypeScript linting on the base preset. */
const react: OxlintConfig = defineConfig({
  extends: [base],
  options: {
    typeAware: true,
    typeCheck: true,
    reportUnusedDisableDirectives: "error",
  },
  // Oxlint replaces inherited plugins. This list includes all base plugins.
  plugins: [
    "eslint",
    "import",
    "jsdoc",
    "jsx-a11y",
    "node",
    "oxc",
    "promise",
    "react",
    "typescript",
    "unicorn",
    "vitest",
  ],
  rules: {
    // Keep accessibility rules direct. Oxlint drops rules in a nested extends
    // chain when an application extends this preset.
    ...jsxA11yRecommended.rules,
    // Keep React's correctness contract explicit even if base categories change.
    "react/error-boundaries": "error",
    "react/exhaustive-deps": "error",
    "react/immutability": "error",
    "react/incompatible-library": "error",
    "react/jsx-filename-extension": ["error", { extensions: [".jsx", ".tsx"] }],
    "react/jsx-no-constructed-context-values": "error",
    "react/jsx-no-script-url": "error",
    "react/jsx-no-target-blank": "error",
    "react/no-danger": "error",
    "react/no-unknown-property": "error",
    "react/no-unsafe": "error",
    "react/no-unstable-nested-components": "error",
    "react/preserve-manual-memoization": "error",
    "react/purity": "error",
    "react/react-in-jsx-scope": "off",
    "react/refs": "error",
    "react/rules-of-hooks": "error",
    "react/set-state-in-effect": "error",
    "react/set-state-in-render": "error",
    "react/static-components": "error",
    "react/use-memo": "error",
    "react/void-dom-elements-no-children": "error",
    // Fast Refresh permits constant exports.
    "react/only-export-components": ["warn", { allowConstantExport: true }],
  },
});

export { react };
