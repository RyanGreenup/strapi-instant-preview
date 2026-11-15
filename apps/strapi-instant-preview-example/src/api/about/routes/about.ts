import { factories } from "@strapi/strapi";

import { populate, withPopulate } from "../../../populate";

export default factories.createCoreRouter("api::about.about", {
  config: {
    find: withPopulate(populate.about),
  },
});
