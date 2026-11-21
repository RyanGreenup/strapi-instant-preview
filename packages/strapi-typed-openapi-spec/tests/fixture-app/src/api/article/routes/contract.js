const { z } = require("zod/v4");
const { defineResponses } = require("@ryangreenup/strapi-typed-openapi-spec");

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/contract/declared",
      handler: "article.declared",
    },
    defineResponses(
      {
        method: "GET",
        path: "/contract/number/:id(\\d+)",
        handler: "article.number",
        config: { auth: false },
      },
      z.object({ number: z.number().int() }),
    ),
    {
      method: "GET",
      path: "/contract/echo",
      handler: "article.upstream",
      config: { auth: false },
      request: {
        query: { text: z.string(), breakContract: z.literal("yes").optional() },
      },
      response: z.object({ text: z.string() }),
    },
  ],
};
