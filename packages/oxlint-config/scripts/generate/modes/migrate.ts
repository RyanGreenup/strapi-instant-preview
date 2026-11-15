import makeOxlint from "@oxlint/migrate";
import { defineConfig } from "eslint/config";
import type { Config } from "eslint/config";

/**
 * ESLint config blocks are structurally open `defineConfig` does the validation.
 */
function isEslintConfig(value: unknown): value is Config {
  return typeof value === "object" && value !== null;
}

/** Convert an ESLint config to Oxlint form via `@oxlint/migrate`, dropping the `categories` key. */
export async function migrateConfig(config: unknown): Promise<unknown> {
  if (!isEslintConfig(config)) {
    throw new Error("expected an ESLint config object");
  }

  const migrated = await makeOxlint(defineConfig(config));

  delete migrated.categories;

  return migrated;
}
