import type { ZodType } from "zod/v4";

import type { App } from "../adapter";
import type { RouteEntry } from "../catalog";

import { joinPath } from "../catalog/path";

/** A nonempty map of HTTP status codes from `100` through `599`. Use `null` for no body. */
export type RouteResponseMap = Readonly<Record<number, ZodType | null>>;
/** A single schema describes the HTTP `200` body. Use a status map for other statuses. */
export type RouteResponse = ZodType | RouteResponseMap;
/**
 * A trimmed string with a space denotes a route key such as `GET /articles/:id`.
 * Other strings denote handlers. Route keys omit the REST prefix.
 */
export type RouteSelector =
  | string
  | { key: string }
  | { method: string; path: string }
  | { handler: string };

interface RouteDefinition {
  method: string;
  path: string;
  handler: unknown;
}

interface Definition {
  response: RouteResponse;
  owners: WeakSet<App>;
  matched: boolean;
}

interface Declaration {
  selector: Exclude<RouteSelector, string>;
  response: RouteResponse;
}

const registrySymbol = Symbol.for("typed-spec.defineResponses");
const root = globalThis as typeof globalThis & {
  [registrySymbol]?: Map<RouteDefinition, Definition>;
};
const definitions = (root[registrySymbol] ??= new Map());
const declarations = new WeakMap<App, Map<string, Declaration>>();

/**
 * Registers a response contract in a Strapi Content API route file and returns
 * the same route object unchanged.
 *
 * @remarks
 * Use the app's Zod v4 instance. A single schema describes the HTTP `200` body.
 * In a status map, `null` means that the response has no body.
 * Contract resolution matches the route by method, path, and handler.
 */
export function defineResponses<T extends RouteDefinition>(
  route: T,
  response: RouteResponse,
): T {
  definitions.set(route, { response, owners: new WeakSet(), matched: false });
  return route;
}

function routeKey(method: string, path: string): string {
  return `${method.trim().toUpperCase()} ${joinPath(path)}`;
}

/**
 * Registers a response contract for one app. A declaration for the same selector
 * replaces its previous response. The selector must match at contract resolution.
 */
export function declare(
  app: App,
  selector: RouteSelector,
  response: RouteResponse,
): void {
  const selected =
    typeof selector === "string"
      ? selector.trim().includes(" ")
        ? { key: selector.trim() }
        : { handler: selector.trim() }
      : selector;
  let entries = declarations.get(app);
  if (!entries) {
    entries = new Map();
    declarations.set(app, entries);
  }
  const identity =
    "handler" in selected
      ? `handler ${selected.handler}`
      : "key" in selected
        ? selected.key
        : routeKey(selected.method, selected.path);
  entries.set(identity, { selector: selected, response });
}

function handlerMatches(actual: string, expected: string): boolean {
  return (
    actual === expected ||
    (!expected.includes("::") && actual.endsWith(`.${expected}`))
  );
}

/**
 * Resolves declarations against the full Content API catalog. App-level route
 * keys take precedence over app-level handler selectors, then `defineResponses`.
 */
export function matchDeclarations(
  app: App,
  routes: readonly RouteEntry[],
): Map<string, RouteResponse> {
  const matches = new Map<string, RouteResponse>();
  const byKey = new Map(routes.map((route) => [route.key, route]));
  for (const [definition, entry] of definitions) {
    const method = definition.method.trim().toUpperCase();
    const path = joinPath(definition.path);
    const key = `${method} ${path}`;
    const handler =
      typeof definition.handler === "string"
        ? definition.handler.trim()
        : "inline";
    const direct = byKey.get(key);
    const candidates =
      direct && handlerMatches(direct.handler, handler)
        ? [direct]
        : routes.filter(
            (route) =>
              (method === "ALL" || route.method === method) &&
              joinPath(route.rawPath) === path &&
              handlerMatches(route.handler, handler),
          );
    if (candidates.length === 0) {
      if (!entry.matched || entry.owners.has(app)) {
        throw new Error(
          `Response declaration for ${key} (${handler}) matches no content-API route`,
        );
      }
      continue;
    }
    if (candidates.some((route) => route.fullPath !== candidates[0].fullPath)) {
      throw new Error(
        `Response declaration for ${key} is ambiguous: ${candidates.map((route) => route.key).join(", ")}`,
      );
    }
    for (const route of candidates) {
      if (matches.has(route.key))
        throw new Error(
          `Multiple defineResponses declarations match ${route.key}`,
        );
      matches.set(route.key, entry.response);
    }
    entry.matched = true;
    entry.owners.add(app);
  }

  const entries = declarations.get(app);
  if (!entries) return matches;
  const selectedKeys = new Map<string, RouteResponse>();
  for (const [identity, { selector, response }] of entries) {
    if ("handler" in selector) {
      const qualified = routes.filter(
        (route) => route.handler === selector.handler,
      );
      const found =
        qualified.length > 0
          ? qualified
          : routes.filter((route) =>
              handlerMatches(route.handler, selector.handler),
            );
      if (found.length === 0)
        throw new Error(
          `Response declaration for ${identity} matches no content-API route`,
        );
      for (const route of found) matches.set(route.key, response);
    } else {
      if (!byKey.has(identity))
        throw new Error(
          `Response declaration for ${identity} matches no content-API route`,
        );
      selectedKeys.set(identity, response);
    }
  }
  for (const [key, response] of selectedKeys) matches.set(key, response);
  return matches;
}
