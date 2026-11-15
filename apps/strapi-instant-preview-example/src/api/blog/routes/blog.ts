import { factories } from "@strapi/strapi";

import { populate, withPopulate } from "../../../populate";

export default factories.createCoreRouter("api::blog.blog", {
  config: {
    find: withPopulate(populate.blog),
  },
});
