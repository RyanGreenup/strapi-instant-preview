import type { GenerationMode, PluginSpec } from "../plugins/types.ts";

import { createJsPluginConfig } from "./js-plugin.ts";
import { migrateConfig } from "./migrate.ts";

type ModeHandler = (spec: PluginSpec, config: unknown) => Promise<unknown>;

export const modeHandlers = {
  migrate: (_spec, config) => migrateConfig(config),
  jsPlugin: (spec, config) =>
    Promise.resolve(createJsPluginConfig(spec, config)),
} satisfies Record<GenerationMode, ModeHandler>;
