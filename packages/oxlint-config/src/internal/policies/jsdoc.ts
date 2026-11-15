import { defineConfig } from "oxlint";

const jsdocCfg = defineConfig({
  plugins: ["jsdoc"],
  rules: {
    "jsdoc/check-access": "error",
    "jsdoc/check-property-names": "error",
    "jsdoc/check-tag-names": "error",
    "jsdoc/empty-tags": "error",
    "jsdoc/implements-on-classes": "error",
    "jsdoc/no-defaults": "error",
    "jsdoc/require-param": "error",
    "jsdoc/require-param-description": "error",
    "jsdoc/require-param-name": "error",
    "jsdoc/require-param-type": "error",
    "jsdoc/require-property": "error",
    "jsdoc/require-property-description": "error",
    "jsdoc/require-property-name": "error",
    "jsdoc/require-property-type": "error",
    "jsdoc/require-returns": "error",
    "jsdoc/require-returns-description": "error",
    "jsdoc/require-returns-type": "error",
    "jsdoc/require-throws-description": "off",
    "jsdoc/require-throws-type": "error",
    "jsdoc/require-yields": "error",
    "jsdoc/require-yields-description": "off",
    "jsdoc/require-yields-type": "error",
  },
  overrides: [
    {
      // In TypeScript the signature carries every parameter, return and throw
      // type, and the compiler checks it. A type in the JSDoc tag is a second
      // copy that can drift. These tags stay required in JavaScript, where
      // JSDoc is the only source of types.
      files: ["**/*.{ts,tsx,mts,cts}"],
      rules: {
        "jsdoc/require-param-type": "off",
        "jsdoc/require-property-type": "off",
        "jsdoc/require-returns-type": "off",
        "jsdoc/require-throws-type": "off",
        "jsdoc/require-yields-type": "off",
      },
    },
  ],
});

export { jsdocCfg };
