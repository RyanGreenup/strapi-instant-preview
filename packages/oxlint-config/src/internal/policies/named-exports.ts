import { defineConfig } from "oxlint";

export const namedExports = defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "import"],
  categories: {
    correctness: "error",
  },
  env: {
    builtin: true,
  },
  rules: {
    "import/no-default-export": "error",
    "import/prefer-default-export": "off",
    "import/no-named-export": "off",
  },
  overrides: [
    // Named exports everywhere => safe renames, exact find-references,
    // reliable auto-imports, easy CJS/ESM interop, better tree-shaking.
    // Exceptions exist only for an external contract, e.g. config files
    {
      files: ["**/*.config.*", "**/.storybook/**", "**/*.stories.*", "**/pages/**"],
      rules: {
        "import/no-default-export": "off",
      },
    },
    // Lazy-load boundaries: Solid's lazy(() => import(...)) resolves the
    // module's `default` property.
    {
      files: ["src/**/*.lazy.tsx"],
      rules: {
        "import/no-default-export": "off",
      },
    },
  ],
});
