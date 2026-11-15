import { defineConfig as defineOxConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

import solidJson from "../generated/recommended/solid-recommended.json";
import { asConfig } from "../internal/as-config";
import { base } from "./base";
/* Generated at build time by scripts/generate/index.ts; carries the
 * jsPlugins entry that loads eslint-plugin-solid at lint time.
 */

/** eslint-plugin-solid's recommended set, run through the JS plugin */
const solidRecommended: OxlintConfig = asConfig(solidJson);

/* This module is the Solid entry point: it pulls in eslint-plugin-solid's
 * recommended set plus our custom ref-pattern plugin, neither of which belong
 * in the framework-agnostic base, then curates rule levels on top.
 */
export const solid: OxlintConfig = defineOxConfig({
  extends: [base, solidRecommended],
  jsPlugins: [
    {
      name: "solid-js-custom",
      specifier: "@rs/oxlint-config/plugins/solid-ref-pattern",
    },
  ],
  rules: {
    // Replaced by solid-js-custom/init-declarations, which permits the
    // SolidJS pattern of assigning a variable through a JSX ref
    "init-declarations": "off",
    "solid-js-custom/init-declarations": ["error", "always"],
    // favour idiomatic
    "solid/prefer-show": "error",
    // Deprecated in Solid JS 2.0
    "solid/prefer-classlist": "off",
    // These should be default, but for posterity's sake
    "solid/components-return-once": "error",
    "solid/event-handlers": "error",
    "solid/imports": "error",
    "solid/jsx-no-duplicate-props": "error",
    "solid/jsx-no-script-url": "error",
    "solid/jsx-no-undef": "error",
    "solid/jsx-uses-vars": "error",
    "solid/no-array-handlers": "error",
    "solid/no-destructure": "error",
    "solid/no-innerhtml": "error",
    "solid/no-react-deps": "error",
    "solid/no-react-specific-props": "error",
    "solid/no-unknown-namespaces": "error",
    "solid/prefer-for": "error",
    "solid/reactivity": "error",
    "solid/self-closing-comp": "error",
    "solid/style-prop": "error",
  },
});
