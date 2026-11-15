import type { Core } from "@strapi/strapi";

const PLUGIN_ID = "draft-autosave";
const MIN_DEBOUNCE_MS = 100;

interface PluginConfig {
  /** Quiet period after a form change, in milliseconds. */
  debounceMs: number;
}

const config = {
  default: { debounceMs: 500 } satisfies PluginConfig,
  validator(value: Partial<PluginConfig>): void {
    const { debounceMs } = value;
    if (typeof debounceMs !== "number" || !Number.isFinite(debounceMs)) {
      throw new TypeError(
        `${PLUGIN_ID}: config.debounceMs must be a number of milliseconds`,
      );
    }
    if (debounceMs < MIN_DEBOUNCE_MS) {
      throw new Error(
        `${PLUGIN_ID}: config.debounceMs must be at least ${MIN_DEBOUNCE_MS}`,
      );
    }
  },
};

const controllers = {
  config: ({
    strapi,
  }: {
    strapi: Core.Strapi;
  }): {
    get: (ctx: { body: unknown }) => void;
  } => ({
    get(ctx: { body: unknown }): void {
      const debounceMs = strapi.plugin(PLUGIN_ID).config<number>("debounceMs");
      ctx.body = { debounceMs };
    },
  }),
};

const routes = {
  admin: {
    type: "admin",
    routes: [
      {
        method: "GET",
        path: "/config",
        handler: "config.get",
        config: { policies: ["admin::isAuthenticatedAdmin"] },
      },
    ],
  },
};

const plugin = { config, controllers, routes };

export default plugin;
