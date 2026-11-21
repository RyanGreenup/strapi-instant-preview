import { base } from "@ryangreenup/oxlint-config";
import { defineConfig } from "oxlint";

// A Strapi app written the way Strapi scaffolds it (CommonJS config and API
// files). Every rule below fired on the fixture as vendored, with its hit
// count at that time. Delete a line once that rule is clean.
export default defineConfig({
  extends: [base],
  // A template the spec test copies next to a generated paths.d.ts and
  // compiles there; it cannot type-check on its own.
  ignorePatterns: ["client.ts"],
  rules: {
    "func-style": "off", // 1
    "import/no-commonjs": "off", // 54
    "import/unambiguous": "off", // 20
    "no-await-in-loop": "off", // 2
    "no-implicit-globals": "off", // 1
    "no-magic-numbers": "off", // 2
    "require-await": "off", // 4
    "typescript/no-require-imports": "off", // 16
    "typescript/no-unsafe-assignment": "off", // 24
    "typescript/no-unsafe-call": "off", // 26
    "typescript/no-unsafe-member-access": "off", // 23
    "typescript/no-unsafe-return": "off", // 1
    "typescript/no-var-requires": "off", // 16
    "typescript/require-await": "off", // 4
    "typescript/strict-boolean-expressions": "off", // 2
    "unicorn/no-anonymous-default-export": "off", // 2
    "unicorn/no-array-callback-reference": "off", // 1
    "unicorn/prefer-module": "off", // 39
    "unicorn/prefer-string-raw": "off", // 1
  },
});
