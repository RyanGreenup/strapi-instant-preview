import type { App } from "../../adapter";

import { getZod } from "../../adapter";
import { resolveConfig } from "../../config";
import { runtime } from "../../runtime";

type Context = {
  state: { auth?: { credentials?: unknown } };
  body: unknown;
  unauthorized(message: string): void;
  internalServerError(message: string): void;
};

export default function contentAPI({ strapi }: { strapi: App }) {
  const resolved = resolveConfig(strapi);
  if (resolved.ok === false) {
    throw new Error(
      `Cannot register the OpenAPI spec endpoint: ${resolved.error.message}`,
      { cause: resolved.error },
    );
  }
  const config = resolved.value;
  const router = { type: "content-api" as const, prefix: "", routes: [] };
  if (!config.exposeSpec) return router;
  const z = getZod(strapi);
  return {
    ...router,
    routes: [
      {
        method: "GET" as const,
        path: "/openapi-contract/spec.json",
        config: {
          auth: config.exposeSpecAuth ? { scope: [] } : (false as const),
        },
        response: z.looseObject({
          openapi: z.literal("3.1.0"),
          info: z.looseObject({ title: z.string(), version: z.string() }),
          paths: z.record(
            z.string(),
            z.record(
              z.string(),
              z.object({ operationId: z.string() }).passthrough(),
            ),
          ),
        }),
        handler: (ctx: Context) => {
          if (config.exposeSpecAuth && !ctx.state.auth?.credentials)
            return ctx.unauthorized("Bearer credentials required");
          const document = runtime(strapi).document;
          if (!document)
            return ctx.internalServerError(
              "OpenAPI contract could not be generated",
            );
          ctx.body = document;
        },
      },
    ],
  };
}
