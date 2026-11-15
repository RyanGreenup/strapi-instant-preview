import type { Core } from "@strapi/strapi";

import { createPreviewConfig } from "@rs/strapi-preview-helpers/server";

const config = ({
  env,
}: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  auth: {
    secret: env("ADMIN_JWT_SECRET")!,
  },
  apiToken: {
    salt: env("API_TOKEN_SALT")!,
  },
  transfer: {
    token: {
      salt: env("TRANSFER_TOKEN_SALT")!,
    },
  },
  secrets: {
    encryptionKey: env("ENCRYPTION_KEY")!,
  },
  flags: {
    nps: env.bool("FLAG_NPS", true),
    promoteEE: env.bool("FLAG_PROMOTE_EE", true),
    docLinks: env.bool("FLAG_DOC_LINKS", true),
  },
  preview: createPreviewConfig({
    frontendUrl: env("WEB_URL"),
    secret: env("PREVIEW_SECRET"),
    resolvePath: async (uid, { documentId, locale }) => {
      if (uid === "api::home.home") return "/preview/";
      if (uid === "api::blog.blog") return "/preview/blog/";
      if (uid !== "api::article.article") return undefined;

      const article = await strapi.documents(uid).findOne({
        documentId,
        locale,
        status: "draft",
        fields: ["slug"],
      });
      return article
        ? `/preview/blog/${encodeURIComponent(article.slug || documentId)}`
        : undefined;
    },
  }),
});

export default config;
