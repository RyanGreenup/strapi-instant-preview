import { defineConfig } from "oxlint";
import { base } from "./base";

const cliCfg = defineConfig({
  extends: [base],
  rules: {
    // Need console in a CLI tool, obviously, keep this on in base as
    // we shouldn't notify users via the console and definitely shouldn't dump
    // dev stuff in there. Favour UI ErrorBoundary with playwright tests to ensure they
    // don't leak details
    "no-console": "off",
    // Exit codes are how the check reports pass/fail to turbo.
    "unicorn/no-process-exit": "off",
    // Intra-app imports across src/ subdirs (commands -> lib) are expected.
    "import/no-relative-parent-imports": "off",
  },
});

export { cliCfg };
