import type { Core } from "@strapi/strapi";

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await strapi.plugin("admin-seed").service("seed").run();
  },
};
