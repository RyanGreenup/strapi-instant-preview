const { factories } = require("@strapi/strapi");

module.exports = factories.createCoreController("api::article.article", () => ({
  async declared(ctx) {
    ctx.body = { ready: true };
  },
  async number(ctx) {
    ctx.body = { number: Number(ctx.params.id) };
  },
  async upstream(ctx) {
    ctx.body = {
      text: ctx.query.breakContract === "yes" ? 42 : ctx.query.text,
    };
  },
}));
