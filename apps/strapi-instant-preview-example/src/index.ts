import type { Core } from "@strapi/strapi";

/** The content the public web app reads, and the actions it needs. */
const publicRead: Record<string, readonly string[]> = {
  "api::global.global": ["find"],
  "api::home.home": ["find"],
  "api::blog.blog": ["find"],
  "api::about.about": ["find"],
  "api::article.article": ["find", "findOne"],
  "api::author.author": ["find", "findOne"],
  "api::category.category": ["find", "findOne"],
};

/**
 * Let the public role read the web app's content. Grants only what is
 * missing, so it is safe to run on every start.
 */
async function grantPublicRead(strapi: Core.Strapi): Promise<void> {
  const role = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "public" } });
  if (!role) return;

  const actions = Object.entries(publicRead).flatMap(([uid, names]) =>
    names.map((name) => `${uid}.${name}`),
  );
  const permissions = strapi.db.query("plugin::users-permissions.permission");
  const granted = await permissions.findMany({
    where: { role: role.id, action: { $in: actions } },
    select: ["action"],
  });
  const grantedActions = new Set(granted.map((p) => p.action));

  for (const action of actions) {
    if (!grantedActions.has(action)) {
      await permissions.create({ data: { action, role: role.id } });
    }
  }
}

export default {
  register() {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await strapi.plugin("admin-seed").service("seed").run();
    await grantPublicRead(strapi);
  },
};
