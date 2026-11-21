const { factories } = require("@strapi/strapi");

module.exports = factories.createCoreController("api::topic.topic", () => ({
  async find(ctx) {
    return super.find(ctx);
  },
}));
