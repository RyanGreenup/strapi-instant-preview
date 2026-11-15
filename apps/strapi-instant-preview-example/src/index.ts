import type { Core } from "@strapi/strapi";

/**
 * Remove every role's content permissions on boot, including existing grants.
 *
 * Role permissions cannot distinguish draft reads from published reads.
 */
async function revokeRoleContentAccess(strapi: Core.Strapi): Promise<void> {
  await strapi.db
    .query("plugin::users-permissions.permission")
    .deleteMany({ where: { action: { $startsWith: "api::" } } });
}

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await strapi.plugin("admin-seed").service("seed").run();
    await revokeRoleContentAccess(strapi);
  },
};
