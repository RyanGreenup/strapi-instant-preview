import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import { funcStyle } from "../internal/policies/func-style";
import { magicNumbers } from "../internal/policies/magic-numbers";
import { namedExports } from "../internal/policies/named-exports";
import { recommended } from "../internal/recommended";
import { vitestCfg } from "../internal/policies/vitest";
import { jsdocCfg } from "../internal/policies/jsdoc";
import { tsCfg } from "../internal/policies/typescript";

const settings = {
  maxStatements: 20,
  /** Max parameters per function, more than that and we need a dictionary,
   * much like rust reasoning is simple, it's an opportunity for a shared type
   * interface that has docstrings, an opportunity for refactor and
   * documentation
   */
  maxParams: 3,
  /** 10 is a good level for a greenfield project which everything under here is */
  maxCognitiveComplexity: 10,
};
export const base: OxlintConfig = defineConfig({
  extends: [recommended, magicNumbers, namedExports, funcStyle, vitestCfg, jsdocCfg, tsCfg],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  plugins: [
    "eslint",
    "import",
    "jsdoc",
    "jsx-a11y",
    "node",
    "oxc",
    "promise",
    "typescript",
    "unicorn",
    "vitest",
  ],
  jsPlugins: [
    {
      name: "jsdoc-public",
      specifier: "eslint-plugin-jsdoc",
    },
  ],
  ignorePatterns: ["dist/**", "coverage/**", "vendor/**", "test/snapshots/**"],
  categories: {
    correctness: "deny",
    // To much churn
    nursery: "allow",
    pedantic: "deny",
    perf: "deny",
    // Better to whitelist over time, flip the switch when fatigue wins
    // this helps me build up a foundation and consider scope for improvement
    // rathern than just ignoring them all outright
    restriction: "deny",
    style: "deny",
    suspicious: "deny",
  },
  rules: {
    // Too many false positives, no auto fix, very burdensome
    "id-length": "allow",
    // oxfmt's problem, not ours
    "sort-imports": "allow",
    "sort-keys": "off",
    // oxlint 1.80 reports this rule approximately 3000 times.
    // The rule conflicts with the one-binding-per-line output from oxfmt.
    "one-var": "allow",
    // This ESM-only repository uses top-level await in CLI entries, configuration files, and content modules.
    "node/no-top-level-await": "allow",
    // Few pain points but catches pain
    "unicorn/no-null": "error",
    // TypeScript and JavaScript model ordinary absence with undefined.
    "eslint/no-undefined": "off",
    // Modern syntax; forbidding either obscures otherwise direct code.
    "oxc/no-async-await": "off",
    "oxc/no-rest-spread-properties": "off",
    // A compact export block is useful, but requiring a single declaration
    // creates friction around exported types and interfaces.
    "import/group-exports": "off",
    "import/exports-last": "error",
    // Promise correctness is mandatory; await remains a preference.
    "typescript/no-floating-promises": "error",
    "promise/prefer-await-to-then": "warn",
    // Do not permit unresolved any values to cross typed operations.
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/consistent-return": "error",
    "typescript/no-confusing-void-expression": "error",
    "typescript/strict-void-return": "error",
    "typescript/strict-boolean-expressions": "error",
    "typescript/ban-ts-comment": [
      "error",
      {
        "ts-ignore": "allow-with-description",
        "ts-expect-error": "allow-with-description",
      },
    ],
    "no-unused-expressions": "error",
    // Drop the ternary half. An explicit `x === undefined ? a : b` already shows
    // which values it treats as absent, and `??` changes behavior when the type can
    // include null. The `||` half is important as falsy value (false, 0, "", NaN)
    // could fall through where we meant undefined / null.
    "typescript/prefer-nullish-coalescing": ["error", { ignoreTernaryTests: true }],
    "typescript/use-unknown-in-catch-callback-variable": "error",
    "typescript/method-signature-style": "error",
    "typescript/promise-function-async": [
      "error",
      {
        checkArrowFunctions: false,
      },
    ],
    // Keep intent and API changes local to the function declaration.
    "typescript/explicit-function-return-type": [
      "error",
      {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowIIFEs: true,
      },
    ],
    // Require public documentation without duplicating TypeScript signatures
    // in @param and @returns tags on every documented private helper.
    "jsdoc-public/require-jsdoc": ["error", { publicOnly: true }],
    "jsdoc/require-param": "off",
    "jsdoc/require-returns": "off",
    // Separate architectural signals: module size, procedure size, and
    // branching difficulty.
    "eslint/max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    "eslint/max-statements": ["error", settings.maxStatements],
    "sonarjs/cognitive-complexity": ["error", settings.maxCognitiveComplexity],
    "eslint/max-params": ["error", settings.maxParams],
    "eslint/require-unicode-regexp": "error",
    "eslint/prefer-named-capture-group": "error",
    "promise/prefer-await-to-callbacks": "warn",
    // Off: any package with a nested source layout imports across directories,
    // this preset included. The rule's remedy (split into another package) is
    // rarely the right trade for an internal module.
    "import/no-relative-parent-imports": "off",
    "eslint/no-inline-comments": "off",
    "unicorn/import-style": "off",
    // Messier code to support ancient browsers
    "oxc/no-optional-chaining": "off",
    // Way too noisy, no autofix
    "capitalized-comments": "allow",
    "eslint/no-ternary": "off",
    "no-use-before-define": [
      "error",
      {
        // Export everything at the end so dictionaries can be exported with
        // functions as they can't be exported before definition.
        // This keeps all  exports in one place, the bottom
        allowNamedExports: true,
        // Classes may benefit in readability, let typescript deal with it
        classes: false,
        // Top down pattern is common
        functions: false,
      },
    ],
    "max-lines-per-function": [
      "error",
      {
        // They're still a function
        IIFEs: true,
        // less than e.g. 50 is over spliting probably
        max: 80,
      },
    ],
    // unfixable noise
    "typescript/prefer-readonly-parameter-types": "off",
    "typescript/prefer-readonly": "off",
    "eslint/capitalized-comments": "off",
    "eslint/no-duplicate-imports": [
      "error",
      {
        allowSeparateTypeImports: true,
      },
    ],
    // Only useful if certain its frontend code
    // not that helpful, obvious mistakes
    "import/no-nodejs-modules": "off",
  },

  env: {
    browser: true,
    builtin: true,
  },
  overrides: [
    {
      // Panda loads its configuration as CommonJS, where import.meta.dirname
      // is unavailable and __dirname is the correct directory reference.
      files: ["panda.config.ts"],
      rules: {
        "unicorn/prefer-module": "off",
      },
    },
    {
      // JavaScript files do not use TypeScript return types.
      files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
      rules: {
        "typescript/explicit-function-return-type": "off",
      },
    },
    {
      // Null is part of some serialized and validation boundary contracts.
      files: ["**/schemas/**", "**/dto/**", "**/*.schema.*", "**/*.dto.*"],
      rules: {
        "unicorn/no-null": "off",
      },
    },
    {
      // Ambient declarations are script-like by design: adding the top-level
      // export that `unambiguous` asks for turns the file into a module and
      // demotes its global `declare module` blocks to augmentations.
      files: ["**/*.d.ts"],
      rules: {
        "import/unambiguous": "off",
      },
    },
    {
      // CLI composition is commonly long but intentionally linear.
      files: ["**/main.ts", "**/cli.ts", "**/commands/index.ts", "**/commands/register.ts"],
      rules: {
        "eslint/max-statements": "off",
      },
    },
    // Correct for test files, wrong for setup files
    {
      files: [
        "vitest.setup.*.ts",
        "vitest.config.ts",
        "tests/**/vitest.setup.*.ts",
        "scripts/**/*.{ts,tsx}",
      ],
      rules: {
        "vitest/require-top-level-describe": "off",
        "import/no-unassigned-import": "off",
      },
    },
  ],
});
