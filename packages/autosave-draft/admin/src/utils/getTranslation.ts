import { PLUGIN_ID } from "../pluginId";

const getTranslation = (id: string): string => `${PLUGIN_ID}.${id}`;

export { getTranslation };
