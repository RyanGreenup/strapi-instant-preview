import { PLUGIN_ID } from "../pluginId";

/** Prefixes a translation key with the plugin identifier. */
const getTranslation = (id: string): string => `${PLUGIN_ID}.${id}`;

export { getTranslation };
