import type { StrapiApp } from "@strapi/strapi/admin";

import { AutosavePanel } from "./components/AutosavePanel";
import { PLUGIN_ID } from "./pluginId";
import { getTranslation } from "./utils/getTranslation";

const translations = import.meta.glob<Record<string, string>>(
  "./translations/*.json",
  { import: "default" },
);

const isSidePanelAdder = (
  value: unknown,
): value is (panels: unknown[]) => void => typeof value === "function";

const plugin: StrapiApp["appPlugins"][string] = {
  register(app) {
    app.registerPlugin({
      id: PLUGIN_ID,
      name: PLUGIN_ID,
    });
  },

  bootstrap(app) {
    // Disable only autosave if Strapi changes its side-panel registration API.
    const contentManager: { apis?: Record<string, unknown> } | undefined =
      app.getPlugin("content-manager");
    const addEditViewSidePanel = contentManager?.apis?.["addEditViewSidePanel"];
    if (!isSidePanelAdder(addEditViewSidePanel)) {
      // oxlint-disable-next-line no-console -- The admin has no plugin logger.
      console.warn(
        `${PLUGIN_ID}: Content Manager does not expose addEditViewSidePanel; autosave is disabled`,
      );
      return;
    }
    addEditViewSidePanel([AutosavePanel]);
  },

  async registerTrads({ locales }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const loadTranslation = translations[`./translations/${locale}.json`];
          if (loadTranslation === undefined) {
            return { data: {}, locale };
          }

          const data = await loadTranslation();

          const newData: Record<string, string> = {};

          for (const [key, message] of Object.entries(data)) {
            newData[getTranslation(key)] = message;
          }

          return { data: newData, locale };
        } catch {
          return { data: {}, locale };
        }
      }),
    );
  },
};

export default plugin;
