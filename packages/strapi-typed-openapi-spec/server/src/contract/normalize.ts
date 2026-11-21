import type { ZodType } from "zod/v4";

import type { Zod } from "../adapter";

export interface ResponseEntry {
  status: number;
  schema: ZodType | null;
}

/**
 * Expands a lone schema to HTTP `200`. In a status map, codes must be `100`
 * through `599` and `null` entries denote responses with no body.
 *
 * @throws If `response` is neither a schema from `z` nor a valid, nonempty
 * status map of schemas from `z` or `null`.
 */
export function normalizeRouteResponse(
  response: unknown,
  z: Zod,
): ResponseEntry[] {
  if (response instanceof z.ZodType) return [{ status: 200, schema: response }];
  if (
    response == null ||
    typeof response !== "object" ||
    Array.isArray(response)
  ) {
    throw new TypeError("Expected a Zod schema or an HTTP status map");
  }
  const entries = Object.entries(response);
  if (entries.length === 0)
    throw new TypeError("A response status map must not be empty");
  return entries.map(([key, schema]) => {
    if (!/^[1-5]\d{2}$/.test(key))
      throw new TypeError(`Invalid HTTP status ${JSON.stringify(key)}`);
    if (schema !== null && !(schema instanceof z.ZodType)) {
      throw new TypeError(
        `Expected a Zod v4 schema or null for HTTP status ${key}`,
      );
    }
    return { status: Number(key), schema };
  });
}
