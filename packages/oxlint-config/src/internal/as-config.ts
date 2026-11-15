import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

/**
 * Oxlint configs are structurally open, so the generated JSON only has to be an
 * object; `defineConfig` validates the rest.
 */
function isOxlintConfig(json: unknown): json is OxlintConfig {
  return typeof json === "object" && json !== null;
}

/** Adopt a generated JSON module as an oxlint config. */
function asConfig(json: unknown): OxlintConfig {
  if (!isOxlintConfig(json)) {
    throw new TypeError("generated config is not an object");
  }

  return defineConfig(json);
}

export { asConfig };
