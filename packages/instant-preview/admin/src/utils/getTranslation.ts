import { PLUGIN_ID } from "../pluginId";

/** Prefixes a translation key with the plugin's identifier. */
function getTranslation(id: string): string {
  return `${PLUGIN_ID}.${id}`;
}

export { getTranslation };
