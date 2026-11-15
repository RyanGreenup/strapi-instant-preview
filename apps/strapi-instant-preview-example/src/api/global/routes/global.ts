import { factories } from "@strapi/strapi";

import { populate, withPopulate } from "../../../populate";

export default factories.createCoreRouter("api::global.global", {
  config: {
    find: withPopulate(populate.global),
  },
});
