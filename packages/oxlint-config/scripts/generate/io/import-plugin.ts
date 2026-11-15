import type { PluginModule } from "../plugins/types.ts";

import { isRecord } from "../guards.ts";

function isPluginModule(value: unknown): value is PluginModule {
  return isRecord(value) && "default" in value;
}

/** Dynamically import the plugin module . */
export async function importPlugin(specifier: string): Promise<PluginModule> {
  const module: unknown = await import(specifier);
  if (!isPluginModule(module)) {
    throw new Error(`${specifier} has no default export`);
  }

  return module;
}
