import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

const tanstackRouter: OxlintConfig = defineConfig({
  ignorePatterns: ["**/src/routeTree.gen.ts"],
  overrides: [
    {
      // TanStack Router imports named route values from route modules.
      files: ["**/src/routes/**/*.ts", "**/src/routes/**/*.tsx"],
      rules: {
        "import/no-named-export": "off",
        "import/prefer-default-export": "off",
      },
    },
    {
      // The root route can import parent assets and global styles.
      files: ["**/src/routes/__root.ts", "**/src/routes/__root.tsx"],
      rules: {
        "import/no-relative-parent-imports": "off",
        "import/no-unassigned-import": "off",
      },
    },
  ],
});

export { tanstackRouter };
