import { base } from "@ryangreenup/oxlint-config";
import { defineConfig } from "oxlint";

// The package was vendored from a standalone repo that was linted with
// Prettier only. Every rule below fired on the code as copied in; each is
// turned off for the area it fired in, with its hit count at vendoring time.
// Delete a line once that rule is clean, so the list only shrinks.
export default defineConfig({
  extends: [base],
  // The fixture is its own workspace package with its own lint config.
  ignorePatterns: ["tests/fixture-app/**"],
  overrides: [
    {
      files: ["server/src/**"],
      rules: {
        complexity: "off", // 13
        curly: "off", // 313
        "default-case": "off", // 3
        eqeqeq: "off", // 5
        "import/consistent-type-specifier-style": "off", // 8
        "import/exports-last": "off", // 75
        "import/max-dependencies": "off", // 2
        "import/no-anonymous-default-export": "off", // 5
        "import/no-cycle": "off", // 4
        "import/no-default-export": "off", // 8
        "import/no-namespace": "off", // 2
        "init-declarations": "off", // 16
        "jsdoc-public/require-jsdoc": "off", // 16
        "jsdoc/check-tag-names": "off", // 11
        "max-depth": "off", // 12
        "max-lines": "off", // 5
        "max-lines-per-function": "off", // 19
        "max-params": "off", // 23
        "max-statements": "off", // 18
        "no-continue": "off", // 47
        "no-control-regex": "off", // 1
        "no-eq-null": "off", // 5
        "no-implicit-coercion": "off", // 3
        "no-inner-declarations": "off", // 1
        "no-magic-numbers": "off", // 33
        "no-multi-assign": "off", // 3
        "no-negated-condition": "off", // 4
        "no-nested-ternary": "off", // 25
        "no-new": "off", // 2
        "no-param-reassign": "off", // 4
        "no-plusplus": "off", // 7
        "no-shadow": "off", // 8
        "no-underscore-dangle": "off", // 4
        "node/callback-return": "off", // 1
        "node/no-process-env": "off", // 4
        "node/no-sync": "off", // 2
        "oxc/no-map-spread": "off", // 1
        "prefer-destructuring": "off", // 11
        "prefer-named-capture-group": "off", // 2
        "prefer-object-has-own": "off", // 2
        "preserve-caught-error": "off", // 1
        "require-unicode-regexp": "off", // 45
        "sonarjs/cognitive-complexity": "off", // 38
        "sonarjs/concise-regex": "off", // 3
        "sonarjs/misplaced-loop-counter": "off", // 2
        "sonarjs/no-control-regex": "off", // 1
        "sonarjs/no-nested-assignment": "off", // 1
        "sonarjs/no-nested-conditional": "off", // 33
        "sonarjs/no-nested-template-literals": "off", // 5
        "sonarjs/no-unused-vars": "off", // 1
        "sonarjs/regex-complexity": "off", // 2
        "sonarjs/super-linear-regex": "off", // 4
        "typescript/ban-types": "off", // 1
        "typescript/consistent-return": "off", // 20
        "typescript/consistent-type-definitions": "off", // 32
        "typescript/explicit-function-return-type": "off", // 84
        "typescript/explicit-module-boundary-types": "off", // 37
        "typescript/method-signature-style": "off", // 15
        "typescript/no-confusing-void-expression": "off", // 4
        "typescript/no-deprecated": "off", // 3
        "typescript/no-dynamic-delete": "off", // 1
        "typescript/no-misused-spread": "off", // 1
        "typescript/no-non-null-assertion": "off", // 12
        "typescript/no-redundant-type-constituents": "off", // 1
        "typescript/no-unnecessary-boolean-literal-compare": "off", // 6
        "typescript/no-unnecessary-type-assertion": "off", // 3
        "typescript/no-unsafe-argument": "off", // 4
        "typescript/no-unsafe-assignment": "off", // 19
        "typescript/no-unsafe-call": "off", // 5
        "typescript/no-unsafe-function-type": "off", // 1
        "typescript/no-unsafe-member-access": "off", // 16
        "typescript/no-unsafe-return": "off", // 3
        "typescript/no-unsafe-type-assertion": "off", // 25
        "typescript/prefer-nullish-coalescing": "off", // 2
        "typescript/restrict-template-expressions": "off", // 3
        "typescript/strict-boolean-expressions": "off", // 40
        "typescript/strict-void-return": "off", // 1
        "typescript/switch-exhaustiveness-check": "off", // 1
        "typescript/unbound-method": "off", // 1
        "unicorn/catch-error-name": "off", // 10
        "unicorn/consistent-existence-index-check": "off", // 4
        "unicorn/consistent-function-scoping": "off", // 5
        "unicorn/custom-error-definition": "off", // 2
        "unicorn/explicit-length-check": "off", // 29
        "unicorn/max-nested-calls": "off", // 77
        "unicorn/no-array-callback-reference": "off", // 4
        "unicorn/no-array-reverse": "off", // 1
        "unicorn/no-array-sort": "off", // 5
        "unicorn/no-hex-escape": "off", // 1
        "unicorn/no-negated-condition": "off", // 4
        "unicorn/no-nested-ternary": "off", // 28
        "unicorn/no-null": "off", // 16
        "unicorn/no-object-as-default-parameter": "off", // 1
        "unicorn/no-thenable": "off", // 3
        "unicorn/no-useless-undefined": "off", // 3
        "unicorn/prefer-code-point": "off", // 1
        "unicorn/prefer-spread": "off", // 2
        "unicorn/prefer-string-raw": "off", // 3
        "unicorn/prefer-string-replace-all": "off", // 9
        "unicorn/prefer-ternary": "off", // 1
        "unicorn/prefer-type-error": "off", // 1
        "unicorn/switch-case-braces": "off", // 63
      },
    },
    {
      files: ["bin/**", "tests/**"],
      rules: {
        complexity: "off", // 2
        curly: "off", // 103
        "default-case": "off", // 1
        "default-param-last": "off", // 2
        "func-names": "off", // 3
        "func-style": "off", // 48
        "import/no-commonjs": "off", // 46
        "import/no-dynamic-require": "off", // 1
        "import/no-namespace": "off", // 12
        "import/unambiguous": "off", // 7
        "init-declarations": "off", // 21
        "jsdoc-public/require-jsdoc": "off", // 3
        "max-lines-per-function": "off", // 1
        "max-params": "off", // 11
        "max-statements": "off", // 9
        "no-await-in-loop": "off", // 12
        "no-bitwise": "off", // 1
        "no-console": "off", // 11
        "no-continue": "off", // 4
        "no-empty-function": "off", // 1
        "no-implicit-coercion": "off", // 2
        "no-implicit-globals": "off", // 1
        "no-loop-func": "off", // 1
        "no-magic-numbers": "off", // 16
        "no-multi-assign": "off", // 1
        "no-negated-condition": "off", // 1
        "no-nested-ternary": "off", // 3
        "no-param-reassign": "off", // 1
        "no-plusplus": "off", // 1
        "no-shadow": "off", // 5
        "no-underscore-dangle": "off", // 3
        "no-unused-vars": "off", // 7
        "no-use-before-define": "off", // 3
        "node/global-require": "off", // 7
        "node/no-process-env": "off", // 32
        "node/no-sync": "off", // 2
        "oxc/no-map-spread": "off", // 1
        "prefer-destructuring": "off", // 7
        "prefer-named-capture-group": "off", // 2
        "prefer-template": "off", // 2
        "promise/prefer-await-to-callbacks": "off", // 3
        "promise/prefer-await-to-then": "off", // 1
        "require-await": "off", // 1
        "require-unicode-regexp": "off", // 53
        "sonarjs/cognitive-complexity": "off", // 5
        "sonarjs/no-clear-text-protocols": "off", // 4
        "sonarjs/no-nested-conditional": "off", // 4
        "sonarjs/no-nested-template-literals": "off", // 3
        "sonarjs/no-unused-vars": "off", // 4
        "typescript/await-thenable": "off", // 1
        "typescript/no-base-to-string": "off", // 1
        "typescript/no-confusing-void-expression": "off", // 11
        "typescript/no-dynamic-delete": "off", // 3
        "typescript/no-floating-promises": "off", // 27
        "typescript/no-require-imports": "off", // 49
        "typescript/no-unsafe-argument": "off", // 149
        "typescript/no-unsafe-assignment": "off", // 321
        "typescript/no-unsafe-call": "off", // 277
        "typescript/no-unsafe-member-access": "off", // 801
        "typescript/no-unsafe-return": "off", // 71
        "typescript/no-var-requires": "off", // 49
        "typescript/prefer-nullish-coalescing": "off", // 4
        "typescript/prefer-regexp-exec": "off", // 1
        "typescript/require-array-sort-compare": "off", // 2
        "typescript/require-await": "off", // 1
        "typescript/restrict-template-expressions": "off", // 1
        "typescript/strict-boolean-expressions": "off", // 105
        "typescript/strict-void-return": "off", // 2
        "typescript/switch-exhaustiveness-check": "off", // 1
        "typescript/unbound-method": "off", // 3
        "typescript/use-unknown-in-catch-callback-variable": "off", // 1
        "unicorn/consistent-existence-index-check": "off", // 2
        "unicorn/consistent-function-scoping": "off", // 11
        "unicorn/explicit-length-check": "off", // 12
        "unicorn/max-nested-calls": "off", // 7
        "unicorn/new-for-builtins": "off", // 1
        "unicorn/no-array-callback-reference": "off", // 1
        "unicorn/no-array-for-each": "off", // 1
        "unicorn/no-array-sort": "off", // 8
        "unicorn/no-await-expression-member": "off", // 12
        "unicorn/no-negated-condition": "off", // 1
        "unicorn/no-nested-ternary": "off", // 3
        "unicorn/no-null": "off", // 93
        "unicorn/no-object-as-default-parameter": "off", // 1
        "unicorn/no-useless-undefined": "off", // 1
        "unicorn/number-literal-case": "off", // 6
        "unicorn/numeric-separators-style": "off", // 4
        "unicorn/prefer-module": "off", // 9
        "unicorn/prefer-string-raw": "off", // 8
        "unicorn/prefer-string-replace-all": "off", // 7
        "unicorn/prefer-structured-clone": "off", // 2
        "unicorn/prefer-top-level-await": "off", // 1
        "unicorn/switch-case-braces": "off", // 4
        "vitest/consistent-test-it": "off", // 20
        "vitest/expect-expect": "off", // 4
        "vitest/max-expects": "off", // 40
        "vitest/no-conditional-expect": "off", // 2
        "vitest/no-conditional-in-test": "off", // 27
        "vitest/prefer-strict-equal": "off", // 51
        "vitest/require-hook": "off", // 10
        "vitest/require-test-timeout": "off", // 98
        "vitest/require-to-throw-message": "off", // 1
        "vitest/require-top-level-describe": "off", // 88
        "vitest/valid-expect": "off", // 23
      },
    },
  ],
});
