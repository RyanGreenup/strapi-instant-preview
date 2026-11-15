import { PLUGIN_ID } from "../pluginId";

const warned = new Set<string>();

/**
 * Report a broken Strapi assumption
 *
 * This ensures a layout issue leaves a breadcrumb for us to chase up later.
 */
const warnOnce = (message: string): void => {
  if (warned.has(message)) {
    return;
  }
  warned.add(message);
  // oxlint-disable-next-line no-console -- The admin has no plugin logger.
  console.warn(`${PLUGIN_ID}: ${message}`);
};

export { warnOnce };
