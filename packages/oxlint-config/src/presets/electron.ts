import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

const mainProcessFiles = ["**/src/main/index.ts"];
const rendererEntryFiles = ["**/src/renderer/src/main.tsx"];

const electron: OxlintConfig = defineConfig({
  overrides: [
    {
      // Electron entry points run startup code outside test hooks.
      files: [...mainProcessFiles, ...rendererEntryFiles],
      rules: {
        "vitest/require-hook": "off",
      },
    },
    {
      // Electron uses callbacks and promises for startup and event handling.
      files: mainProcessFiles,
      rules: {
        "promise/prefer-await-to-callbacks": "off",
        "promise/prefer-await-to-then": "off",
        "unicorn/prefer-top-level-await": "off",
      },
    },
    {
      // Electron Vite provides the renderer URL through process.env.
      files: mainProcessFiles,
      rules: {
        "node/no-process-env": "off",
      },
    },
    {
      // The renderer entry point can import a global stylesheet.
      files: rendererEntryFiles,
      rules: {
        "import/no-unassigned-import": "off",
      },
    },
  ],
});

export { electron };
