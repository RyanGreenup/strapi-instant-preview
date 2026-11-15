import type { Core } from "@strapi/strapi";

interface PopulateConfig {
  populate: object;
}

/**
 * Apply a default `populate` query to a route. A `populate` parameter sent by
 * the client takes precedence.
 */
export default (config: PopulateConfig): Core.MiddlewareHandler => {
  return async (ctx, next) => {
    if (ctx.query.populate === undefined) {
      ctx.query = { ...ctx.query, populate: config.populate };
    }
    await next();
  };
};
