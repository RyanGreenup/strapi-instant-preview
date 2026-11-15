import type { StrapiApp } from "@strapi/strapi/admin";

import { Initializer } from "./components/Initializer";
import { PluginIcon } from "./components/PluginIcon";
import { PLUGIN_ID } from "./pluginId";
import { getTranslation } from "./utils/getTranslation";

const translations = import.meta.glob<{ default: Record<string, string> }>(
  "./translations/*.json",
);

/** Registers the admin menu, initializer, and localized messages with Strapi. */
const plugin: StrapiApp["appPlugins"][string] = {
  register(app) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: PLUGIN_ID,
      },
      Component: () => import("./pages/App"),
      permissions: [],
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  async registerTrads({ locales }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const loadTranslation = translations[`./translations/${locale}.json`];

          if (loadTranslation === undefined) {
            return { data: {}, locale };
          }

          const { default: data } = await loadTranslation();
          const newData: Record<string, string> = {};

          for (const [key, value] of Object.entries(data)) {
            newData[getTranslation(key)] = value;
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
