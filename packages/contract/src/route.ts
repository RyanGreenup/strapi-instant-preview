import type { z } from "zod";

/** What one front-end route needs from Strapi. */
export interface RouteContract<
  Params extends z.ZodType,
  Data extends z.ZodType,
> {
  /** The Astro route pattern, relative to the site root. */
  readonly path: string;
  /** The Strapi REST endpoint that supplies the route's data. */
  readonly endpoint: string;
  /** The route's URL parameters. */
  readonly params: Params;
  /** The `data` member of the Strapi response, fully populated. */
  readonly data: Data;
}

/**
 * Declare a route contract. The identity call keeps the literal types of
 * the schemas.
 *
 * @param contract - The route's path, endpoint and schemas.
 * @returns The same contract.
 */
export const defineRoute = <Params extends z.ZodType, Data extends z.ZodType>(
  contract: RouteContract<Params, Data>,
): RouteContract<Params, Data> => contract;
