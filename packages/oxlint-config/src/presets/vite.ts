import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

/*
 * Vite has one convention: index.html loads a single module that mounts the
 * app. That entry module imports global stylesheets for their side effect and
 * calls `render(...)` at the top level. The rules no-unassigned-import and
 * require-hook both ask code not to do this. Vite scaffolds the entry as
 * `src/index` or `src/main`. The leading `**` also matches a playground or a
 * renderer inside a package.
 */
const entryFiles = ["**/src/index.tsx", "**/src/main.tsx", "**/src/main.ts"];

const vite: OxlintConfig = defineConfig({
  overrides: [
    {
      files: entryFiles,
      rules: {
        "import/no-unassigned-import": "off",
        "vitest/require-hook": "off",
      },
    },
  ],
});

export { vite };
