import { factories } from "@strapi/strapi";

import { populate, withPopulate } from "../../../populate";

export default factories.createCoreRouter("api::home.home", {
  config: {
    find: withPopulate(populate.home),
  },
});
