import type { PluginSpec } from "../plugins/types.ts";

import { collectRules } from "../rules/collect-rules.ts";

/**
 * Build an Oxlint config that loads the spec's JS plugin and lists its rules.
 *
 * Throws when the spec omits `jsPluginName` or `jsPluginSpecifier`.
 */
export function createJsPluginConfig(
  spec: PluginSpec,
  config: unknown,
): unknown {
  const { jsPluginName, jsPluginSpecifier } = spec;
  if (
    jsPluginName === undefined ||
    jsPluginName.length === 0 ||
    jsPluginSpecifier === undefined ||
    jsPluginSpecifier.length === 0
  ) {
    throw new Error(
      `${spec.name} requires jsPluginName and jsPluginSpecifier in jsPlugin mode`,
    );
  }

  return {
    jsPlugins: [
      {
        name: jsPluginName,
        specifier: jsPluginSpecifier,
      },
    ],
    rules: collectRules(config),
  };
}
