import { factories } from "@strapi/strapi";

import { populate, withPopulate } from "../../../populate";

export default factories.createCoreRouter("api::article.article", {
  config: {
    find: withPopulate(populate.article),
    findOne: withPopulate(populate.article),
  },
});
