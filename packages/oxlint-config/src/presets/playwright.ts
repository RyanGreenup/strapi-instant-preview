import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

const playwrightConfigFiles = [
  "**/playwright.config.js",
  "**/playwright.config.mjs",
  "**/playwright.config.cjs",
  "**/playwright.config.ts",
  "**/playwright.config.mts",
  "**/playwright.config.cts",
];

const globalSetupFiles = [
  "**/e2e/global-setup.ts",
  "**/tests/global-setup.ts",
  "**/test/global-setup.ts",
];

const commonJsSupportFiles = [
  ...globalSetupFiles,
  "**/e2e/fixtures.ts",
  "**/tests/fixtures.ts",
  "**/test/fixtures.ts",
];

const e2eFiles = ["**/e2e/**"];

const playwright: OxlintConfig = defineConfig({
  overrides: [
    {
      // Playwright uses environment variables to change its CI behavior.
      files: playwrightConfigFiles,
      rules: {
        "node/no-process-env": "off",
      },
    },
    {
      // Playwright requires a default export from its global setup module.
      files: globalSetupFiles,
      rules: {
        "import/no-default-export": "off",
      },
    },
    {
      // Playwright can load TypeScript support files as CommonJS modules.
      files: commonJsSupportFiles,
      rules: {
        "unicorn/prefer-module": "off",
      },
    },
    {
      // Every file under e2e/ runs on the Playwright runner. `test` and
      // `expect` come from @playwright/test, so the rules that assume the
      // vitest runner do not apply here. `expect.poll` is also an assertion,
      // but sonarjs counts only the plain `expect(...)` call form.
      files: e2eFiles,
      rules: {
        "sonarjs/assertions-in-tests": "off",
        "vitest/consistent-test-filename": "off",
        "vitest/no-conditional-in-test": "off",
        "vitest/prefer-each": "off",
        "vitest/prefer-importing-vitest-globals": "off",
        "vitest/require-hook": "off",
        "vitest/require-test-timeout": "off",
        "vitest/require-top-level-describe": "off",
      },
    },
  ],
});

export { playwright };
