import { isRecord, isUnknownArray } from "../guards.ts";
import type { PluginModule, PluginSpec } from "./types.ts";

interface PluginConfigContainer {
  readonly configs: Record<string, unknown>;
  readonly flatConfigs: Record<string, unknown>;
}

function pluginConfig(module: PluginModule): PluginConfigContainer {
  const { default: exported } = module;
  if (!isRecord(exported)) {
    throw new Error("plugin default export is not an object");
  }

  const { configs, flatConfigs } = exported;

  return {
    configs: isRecord(configs) ? configs : {},
    flatConfigs: isRecord(flatConfigs) ? flatConfigs : {},
  };
}

/**
 * Pull a block's rules out of a typescript-eslint flat-config array.
 *
 * The meta `typescript-eslint` package provides `configs.recommended` as an array
 * of blocks (base, eslint-recommended, recommended). We only want the
 * `recommended` block's rules.
 */
function flatBlockRules(
  config: unknown,
  blockName: string,
): Record<string, unknown> {
  if (!isUnknownArray(config)) {
    throw new Error(`expected a flat-config array to search for ${blockName}`);
  }

  const matches = config.filter(
    (block) => isRecord(block) && block["name"] === blockName,
  );
  const rules: Record<string, unknown> = {};

  for (const block of matches) {
    if (isRecord(block) && isRecord(block["rules"])) {
      Object.assign(rules, block["rules"]);
    }
  }

  if (matches.length === 0) {
    throw new Error(`no flat-config block named ${blockName}`);
  }

  return rules;
}

export const pluginSpecs = [
  {
    name: "eslint",
    specifier: "@eslint/js",
    mode: "migrate",
    pick: (module) => pluginConfig(module).configs["recommended"],
  },
  {
    name: "typescript",
    specifier: "typescript-eslint",
    mode: "migrate",
    pick: (module) => ({
      rules: flatBlockRules(
        pluginConfig(module).configs["recommended"],
        "typescript-eslint/recommended",
      ),
    }),
  },
  {
    name: "import",
    specifier: "eslint-plugin-import",
    mode: "migrate",
    pick: (module) => pluginConfig(module).flatConfigs["recommended"],
  },
  {
    name: "jsdoc",
    specifier: "eslint-plugin-jsdoc",
    mode: "migrate",
    pick: (module) => pluginConfig(module).configs["flat/recommended"],
  },
  {
    name: "jsx-a11y",
    specifier: "eslint-plugin-jsx-a11y",
    mode: "migrate",
    pick: (module) => pluginConfig(module).flatConfigs["recommended"],
  },
  {
    name: "promise",
    specifier: "eslint-plugin-promise",
    mode: "migrate",
    pick: (module) => pluginConfig(module).configs["flat/recommended"],
  },
  {
    name: "node",
    specifier: "eslint-plugin-n",
    mode: "migrate",
    pick: (module) => pluginConfig(module).configs["flat/recommended"],
  },
  {
    name: "unicorn",
    specifier: "eslint-plugin-unicorn",
    mode: "migrate",
    pick: (module) => pluginConfig(module).configs["recommended"],
  },
  {
    name: "jest",
    specifier: "eslint-plugin-jest",
    mode: "migrate",
    pick: (module) => pluginConfig(module).configs["flat/recommended"],
  },
  {
    name: "vitest",
    specifier: "@vitest/eslint-plugin",
    mode: "migrate",
    pick: (module) => pluginConfig(module).configs["recommended"],
  },
  {
    name: "sonarjs",
    specifier: "eslint-plugin-sonarjs",
    mode: "jsPlugin",
    jsPluginName: "sonarjs",
    jsPluginSpecifier: "@rs/oxlint-config/plugins/sonarjs",
    pick: (module) => pluginConfig(module).configs["recommended"],
  },
  {
    name: "solid",
    specifier: "eslint-plugin-solid/configs/recommended",
    mode: "jsPlugin",
    jsPluginName: "solid",
    jsPluginSpecifier: "@rs/oxlint-config/plugins/solid",
    pick: (module) => module.default,
  },
] as const satisfies readonly PluginSpec[];
