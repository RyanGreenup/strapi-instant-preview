import { createJsPluginConfig } from "./js-plugin.ts";
import { migrateConfig } from "./migrate.ts";
import type { GenerationMode, PluginSpec } from "../plugins/types.ts";

type ModeHandler = (spec: PluginSpec, config: unknown) => Promise<unknown>;

export const modeHandlers = {
  migrate: (_spec, config) => migrateConfig(config),
  jsPlugin: (spec, config) => Promise.resolve(createJsPluginConfig(spec, config)),
} satisfies Record<GenerationMode, ModeHandler>;
