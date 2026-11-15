import { PLUGIN_ID } from "../pluginId";

const warned = new Set<string>();

/**
 * Report a broken Strapi assumption once per page load.
 *
 * The e2e fixture fails a test when it sees this prefix in the console.
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
