const { z } = require("zod/v4");

const authenticatedActions = [
  "api::article.article.create",
  "api::article.article.update",
  "api::article.article.delete",
  "api::article.article.declared",
  "api::topic.topic.create",
  "api::topic.topic.update",
  "api::topic.topic.delete",
  "api::link-card.link-card.create",
  "api::link-card.link-card.update",
  "api::landing-page.landing-page.update",
  "api::landing-page.landing-page.delete",
  "plugin::upload.content-api.upload",
  "plugin::upload.content-api.destroy",
  "plugin::users-permissions.auth.getSessions",
  "plugin::users-permissions.auth.revokeSession",
  "plugin::users-permissions.auth.logout",
  "plugin::users-permissions.auth.changePassword",
  "plugin::users-permissions.user.create",
];

const readActions = [
  "api::article.article.find",
  "api::article.article.findOne",
  "api::topic.topic.find",
  "api::topic.topic.findOne",
  "api::link-card.link-card.find",
  "api::link-card.link-card.findOne",
  "api::landing-page.landing-page.find",
  "plugin::upload.content-api.find",
  "plugin::upload.content-api.findOne",
];

async function grantPermissions(strapi, type, actions) {
  const role = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({ where: { type } });
  const permissions = strapi.db.query("plugin::users-permissions.permission");
  for (const action of actions) {
    if (
      !(await permissions.findOne({ where: { action, role: { id: role.id } } }))
    ) {
      await permissions.create({ data: { action, role: role.id } });
    }
  }
}

module.exports = {
  register({ strapi }) {
    strapi.customFields.register({ name: "fixture-color", type: "string" });
    strapi
      .plugin("openapi-contract")
      ?.service("contract")
      .declare(
        { method: "GET", path: "/contract/declared" },
        { 200: z.object({ ready: z.literal(true) }) },
      );
  },

  async bootstrap({ strapi }) {
    const locales = strapi.plugin("i18n").service("locales");
    if (!(await locales.findByCode("fr"))) {
      await locales.create({ code: "fr", name: "French (fr)" });
    }

    await grantPermissions(strapi, "public", readActions);
    await grantPermissions(strapi, "authenticated", [
      ...readActions,
      ...authenticatedActions,
    ]);

    const store = strapi.store({ type: "plugin", name: "users-permissions" });
    const providers = await store.get({ key: "grant" });
    await store.set({
      key: "grant",
      value: {
        ...providers,
        github: {
          ...providers.github,
          enabled: true,
          key: "fixture-client-id",
          secret: "fixture-client-secret",
          callback: "http://127.0.0.1:1337/oauth-complete",
        },
      },
    });
  },
};
