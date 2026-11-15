import { defineConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";
import { asConfig } from "./as-config";
/* All JSON below is generated at build time by scripts/generate/index.ts.
 * Plugins with native oxlint ports are migrated to oxlint rules; sonarjs has no
 * port and runs through its JS plugin (loaded via the jsPlugins field baked
 * into its JSON). solid is intentionally absent here: it is framework-specific
 * and is wired up only in solid.ts. jest is absent too: every jest rule has a
 * vitest twin, so enabling both reports each finding twice and makes the vitest
 * policy tuning (see policies/vitest.ts) look like it has no effect.
 */
import eslintJson from "../generated/recommended/eslint-recommended.json";
import importJson from "../generated/recommended/import-recommended.json";
import jsdocJson from "../generated/recommended/jsdoc-recommended.json";
import jsxA11yJson from "../generated/recommended/jsx-a11y-recommended.json";
import nodeJson from "../generated/recommended/node-recommended.json";
import promiseJson from "../generated/recommended/promise-recommended.json";
import sonarjsJson from "../generated/recommended/sonarjs-recommended.json";
import typescriptJson from "../generated/recommended/typescript-recommended.json";
import unicornJson from "../generated/recommended/unicorn-recommended.json";
import vitestJson from "../generated/recommended/vitest-recommended.json";

const eslintRecommended = asConfig(eslintJson);
const typescriptRecommended = asConfig(typescriptJson);
const importRecommended = asConfig(importJson);
const jsdocRecommended = asConfig(jsdocJson);
const jsxA11yRecommended = asConfig(jsxA11yJson);
const promiseRecommended = asConfig(promiseJson);
const nodeRecommended = asConfig(nodeJson);
const unicornRecommended = asConfig(unicornJson);
const vitestRecommended = asConfig(vitestJson);
const sonarjsRecommended = asConfig(sonarjsJson);

/** Bare aggregation of framework-agnostic recommended sets; no opinions of our
 * own and no framework-specific plugins (see solid.ts for Solid).
 */
export const recommended: OxlintConfig = defineConfig({
  extends: [
    eslintRecommended,
    typescriptRecommended,
    importRecommended,
    jsdocRecommended,
    jsxA11yRecommended,
    promiseRecommended,
    nodeRecommended,
    unicornRecommended,
    vitestRecommended,
    sonarjsRecommended,
  ],
});
