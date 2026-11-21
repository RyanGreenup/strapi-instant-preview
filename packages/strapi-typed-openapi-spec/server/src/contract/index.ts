import type { ZodType } from "zod/v4";

import type { App, Zod } from "../adapter";
import type { RouteEntry } from "../catalog";
import type { Schemas } from "../schemas";

import { getConfig, models } from "../adapter";
import { builtIns } from "./built-ins";
import { matchDeclarations } from "./declarations";
import { normalizeRouteResponse } from "./normalize";
import { userUid } from "./users-permissions";

export { declare, defineResponses } from "./declarations";
export type {
  RouteResponse,
  RouteResponseMap,
  RouteSelector,
} from "./declarations";
export { normalizeRouteResponse } from "./normalize";

/** These fields override upstream request schemas by key, or by media type for `body`. */
export interface RequestOverlay {
  query?: Record<string, ZodType>;
  params?: Record<string, ZodType>;
  body?: Record<string, ZodType>;
}

export interface Contract {
  /** An `uncovered` route has only default error responses. */
  source: "declared" | "built-in" | "core" | "upstream" | "uncovered";
  responses: Map<number, ZodType | null>;
  request?: RequestOverlay;
  /** Model UID for model-aware query parameters such as `filters` and `sort`. */
  queryModel?: string;
}

const bodyMethods = new Set(["POST", "PUT", "PATCH"]);

function errorStatuses(route: RouteEntry): number[] {
  const statuses = [400, 401, 403, 500];
  const core = route.coreAction?.customizations ? undefined : route.coreAction;
  if (
    !core ||
    core.action === "findOne" ||
    (core.action === "update" && core.kind === "collectionType") ||
    (core.action === "find" && core.kind === "singleType")
  )
    statuses.push(404);
  if (bodyMethods.has(route.method)) statuses.push(413);
  return statuses;
}

/**
 * Resolves one contract per route. Declared responses take precedence over
 * built-in, core, and upstream responses, in that order.
 *
 * @remarks
 * Default errors fill only absent statuses. A response declaration does not
 * remove a built-in request overlay.
 */
export function resolveContracts(
  app: App,
  z: Zod,
  routes: readonly RouteEntry[],
  schemas: Schemas,
): Map<string, Contract> {
  const declared = matchDeclarations(app, routes);
  const builtIn = builtIns(z, schemas, {
    config: getConfig<unknown>(app, "plugin::users-permissions", {}),
    userModel: models(app).contentTypes[userUid],
  });
  const contracts = new Map<string, Contract>();
  for (const route of routes) {
    const overrides =
      route.source.kind === "plugin" ? builtIn(route) : undefined;
    const declaration = declared.get(route.key);
    const responses = new Map<number, ZodType | null>();
    let source: Contract["source"];
    if (declaration !== undefined) {
      source = "declared";
      append(declaration);
    } else if (overrides) {
      source = "built-in";
      append(overrides.response);
    } else if (route.coreAction) {
      source = "core";
      const { uid, kind, action } = route.coreAction;
      if (action === "delete") {
        responses.set(204, null);
      } else {
        responses.set(
          action === "create" ? 201 : 200,
          schemas.response(uid, kind === "collectionType" && action === "find"),
        );
      }
    } else if (route.upstream.response != null) {
      source = "upstream";
      append(route.upstream.response);
    } else {
      source = "uncovered";
    }
    for (const status of errorStatuses(route)) {
      if (!responses.has(status))
        responses.set(status, schemas.errorFor(status));
    }
    contracts.set(route.key, {
      source,
      responses,
      ...(overrides?.request ? { request: overrides.request } : {}),
      ...(overrides?.queryModel ? { queryModel: overrides.queryModel } : {}),
    });

    function append(response: unknown): void {
      try {
        for (const { status, schema } of normalizeRouteResponse(response, z)) {
          responses.set(status, schema);
        }
      } catch (cause) {
        throw new Error(
          `Invalid ${source} response contract for ${route.key}`,
          { cause },
        );
      }
    }
  }
  return contracts;
}
