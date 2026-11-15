import { defineConfig } from "oxlint";

const vitest = defineConfig({
  rules: {
    // Preference, conventional but magic is confusing
    "vitest/no-importing-vitest-globals": "off",
    // hasAssertions() only earns its keep in async tests, not every sync case
    "vitest/prefer-expect-assertions": "off",
    // Conflicts with valid-title (function ref vs required string); keep string titles
    "vitest/prefer-describe-function-title": "off",
    // Conflicts with prefer-strict-boolean-matchers (toBe(true) vs toBeTruthy);
    // keep the strict form, coercion hides type bugs
    "vitest/prefer-to-be-truthy": "off",
    "vitest/prefer-to-be-falsy": "off",
    // Per-call timeouts can be noisy, may prefer a global testTimeout in vitest config.
    // NOTE: Keep timeouts lint, Runaway tests have been a pain point,
    // and we should have duration as a part of the test in a sense too.
    // long test runs are my time I don't get back
    // "vitest/require-test-timeout": "off",
    // Contradicts require-hook, which is also on and demands that setup and
    // teardown live in a hook. Keeping both makes any test with fixtures
    // unfixable; require-hook is the more useful half.
    "vitest/no-hooks": "off",
    // Contradicts prefer-called-once, which is also on: one demands
    // toHaveBeenCalledTimes(1), the other toHaveBeenCalledOnce(). No spelling
    // satisfies both, so keep the shorter once form.
    "vitest/prefer-called-times": "off",
  },
  overrides: [
    {
      files: ["tests/**", "**/*.test.*", "**/*.spec.*"],
      rules: {
        // A test file imports every module it exercises, plus its fixtures.
        "import/max-dependencies": "off",
        // Test files grow with the surface that they cover. A split on a line
        // count scatters cases that belong together. A describe block is a
        // list of independent cases, not a function to decompose.
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
      },
    },
  ],
});

export { vitest as vitestCfg };
