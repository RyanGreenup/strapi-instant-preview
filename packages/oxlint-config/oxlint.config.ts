import { defineConfig } from "oxlint";
import { base } from "@rs/oxlint-config";

export default defineConfig({
  extends: [base],
  overrides: [
    {
      // Oxlint loads JS plugins by module default export, and so do the plugin
      // fixtures the tests feed it. Named exports are not an option here.
      files: ["src/plugins/*.ts", "tests/fixtures/*.mjs"],
      rules: {
        "import/no-anonymous-default-export": "off",
        "import/no-default-export": "off",
      },
    },
    {
      // This module exists to aggregate one generated JSON file per plugin, so
      // its dependency count is the plugin count by definition.
      files: ["src/internal/recommended.ts"],
      rules: {
        "import/max-dependencies": "off",
      },
    },
    {
      // Build-time scripts and tests: they report progress on stdout, shell out
      // to npm by name, and block on the filesystem. no-sync guards servers
      // from stalling their event loop; a script that has nothing else to do
      // reads more clearly synchronously.
      files: ["scripts/**", "tests/**"],
      rules: {
        "no-console": "off",
        "node/no-sync": "off",
        "sonarjs/no-os-command-from-path": "off",
      },
    },
  ],
});
