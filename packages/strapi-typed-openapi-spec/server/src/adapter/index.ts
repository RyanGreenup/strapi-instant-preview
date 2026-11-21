import type { Core } from "@strapi/strapi";
import type { Server } from "node:http";

import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import * as z from "zod/v4";

import { normalizeRouteResponse } from "../contract/normalize";

export type App = Core.Strapi;
export type Zod = typeof z;
export type Attribute = { type: string; [key: string]: unknown };
export type Model = {
  attributes: Record<string, Attribute>;
  info: { singularName?: string; pluralName?: string };
  kind?: string;
  options?: { draftAndPublish?: boolean; privateAttributes?: string[] };
  pluginOptions?: Record<string, { localized?: boolean }>;
};
export type Source = { kind: "api" | "plugin"; name: string };
const methodPathFields = { method: z.string(), path: z.string() };
const objectValue = z.looseObject({});
const functionSchema = z.custom<Function>(
  (value) => typeof value === "function",
);
const declaredRouteSchema = z.looseObject({
  ...methodPathFields,
  path: z.string().refine((value) => value.trim().startsWith("/")),
  handler: z.union([z.string(), functionSchema, z.array(functionSchema)]),
  info: z
    .looseObject({
      type: z.string().nullish(),
      apiName: z.string().nullish(),
      pluginName: z.string().nullish(),
    })
    .nullish(),
  config: z
    .looseObject({
      prefix: z.string().nullish(),
      auth: z.union([z.literal(false), objectValue]).nullish(),
    })
    .nullish(),
  request: objectValue.nullish(),
  response: objectValue.nullish(),
});
export type RawRoute = z.output<typeof declaredRouteSchema>;
export type Router = {
  source: Source;
  type: string;
  prefix: string;
  routes: unknown[];
};
export const variantHeaders = {
  format: "Strapi-Response-Format",
  sourceMaps: "Strapi-Encode-Source-Maps",
};
export const pluginName = "openapi-contract";

/** Resolves modules from the target app's `package.json`, not from the plugin. */
export function packageRequire(appDir: string) {
  return createRequire(join(resolve(appDir), "package.json"));
}
export function readManifest(appDir: string) {
  return JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
}
export function appDir(app: App) {
  return app.dirs.app.root;
}
/** Resolves modules relative to the Strapi installation that the target app uses. */
export function strapiRequire(dir: string) {
  return createRequire(
    packageRequire(dir).resolve("@strapi/strapi/package.json"),
  );
}
/** Loads Strapi's Zod v4 instance. Use it for route schemas that must pass `instanceof` checks. */
export function getZod(app: App): Zod {
  const r = strapiRequire(appDir(app));
  return createRequire(r.resolve("@strapi/utils/package.json"))("zod/v4");
}
/** Versions verified by tests. Other versions trigger a warning, not a version check failure. */
export const testedVersions: readonly string[] = ["5.62.0", "5.63.0"];
export function version(app: App): string {
  return strapiRequire(appDir(app))("./package.json").version;
}

type DatabaseMetadata = {
  get(
    uid: string,
  ):
    | { attributes?: Record<string, Record<string, unknown> | undefined> }
    | undefined;
};

/**
 * How the booted app's database stores a relation, from `strapi.db.metadata`.
 * `unknown` when the database or the attribute metadata is not available.
 */
export function relationStorage(app: App) {
  return (uid: string, key: string) => {
    try {
      const metadata = (
        app as unknown as { db?: { metadata?: DatabaseMetadata } }
      ).db?.metadata;
      const attribute = metadata?.get(uid)?.attributes?.[key];
      if (!attribute || attribute.type !== "relation") return "unknown";
      if (attribute.joinTable) return "join-table";
      if (attribute.joinColumn) return "join-column";
    } catch {
      // Fall through: the storage is unknown.
    }
    return "unknown";
  };
}

/**
 * Gives the app's live model registries, its global response-private
 * attributes, and the database storage of its relations.
 */
export function models(app: App) {
  return {
    contentTypes: app.contentTypes,
    components: app.components,
    privateAttributes: getConfig<string[]>(
      app,
      "api.responses.privateAttributes",
      [],
    ),
    relationStorage: relationStorage(app),
  } as unknown as {
    contentTypes: Record<string, Model>;
    components: Record<string, Model>;
    privateAttributes: string[];
    relationStorage: (
      uid: string,
      key: string,
    ) => "join-table" | "join-column" | "unknown";
  };
}
/** The type argument does not validate the value from Strapi's config. */
export function getConfig<T>(app: App, key: string, fallback: T): T {
  return app.config.get<T>(key, fallback);
}
export function warn(app: App, message: string) {
  app.log.warn(`[${pluginName}] ${message}`);
}
export function logError(app: App, message: string) {
  app.log.error(`[${pluginName}] ${message}`);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const routerSchema = z.looseObject({
  routes: z.array(z.unknown()),
  prefix: z.string().nullish(),
  type: z.string().nullish(),
});
function routerShape(value: unknown): value is z.output<typeof routerSchema> {
  return routerSchema.safeParse(value).success;
}
/**
 * Lists declared routers without validating individual routes.
 *
 * @remarks
 * API routers default to `content-api` with no prefix. Plugin routers default
 * to `admin` with `/<plugin name>` as the prefix. Bare plugin route arrays
 * use those same defaults.
 *
 * @throws If a registry is missing or a router map or entry is malformed.
 */
export function listRouters(app: App): Router[] {
  const result: Router[] = [];
  for (const [kind, modules] of [
    ["api", app.apis],
    ["plugin", app.plugins],
  ] as const) {
    if (!object(modules)) throw new Error(`Strapi ${kind} registry is missing`);
    for (const [name, module] of Object.entries(modules)) {
      if (!object(module) || module.routes == null) continue;
      const source = { kind, name };
      if (Array.isArray(module.routes) && kind === "plugin") {
        result.push({
          source,
          type: "admin",
          prefix: `/${name}`,
          routes: module.routes,
        });
        continue;
      }
      if (!object(module.routes))
        throw new Error(`Invalid router map on ${kind}::${name}`);
      for (const [key, router] of Object.entries(module.routes)) {
        if (!routerShape(router)) {
          throw new Error(`Invalid router ${kind}::${name}.${key}`);
        }
        result.push({
          source,
          type:
            typeof router.type === "string"
              ? router.type
              : kind === "api"
                ? "content-api"
                : "admin",
          prefix:
            typeof router.prefix === "string"
              ? router.prefix
              : kind === "plugin"
                ? `/${name}`
                : "",
          routes: router.routes,
        });
      }
    }
  }
  return result;
}
/** Checks a route declaration's shape without changing it or validating its schemas. */
export function routeShape(value: unknown): value is RawRoute {
  return declaredRouteSchema.safeParse(value).success;
}
export type RouteContext = {
  state: { route?: unknown };
  _matchedRoute?: string;
};

export function routeFromCtx(ctx: RouteContext) {
  return {
    identity: routeIdentity(ctx.state.route),
    matched: ctx._matchedRoute,
  };
}
const runtimeRouteSchema = z.looseObject({
  ...methodPathFields,
  info: z.looseObject({
    type: z.string(),
    apiName: z.unknown().optional(),
    pluginName: z.unknown().optional(),
  }),
});
type RouteIdentity = {
  type: string;
  source: string;
  method: string;
  path: string;
};
const identityCache = new WeakMap<object, RouteIdentity>();
/**
 * Returns `undefined` if the request's route metadata lacks a string method, path, or type.
 *
 * @remarks
 * The source prefers `apiName` over `pluginName` and is empty if neither is a string.
 * The result is cached by route object, so do not change its metadata after lookup.
 */
export function routeIdentity(value: unknown) {
  if (!object(value)) return;
  const cached = identityCache.get(value);
  if (cached) return cached;
  const parsed = runtimeRouteSchema.safeParse(value);
  if (!parsed.success) return;
  const { method, path, info } = parsed.data;
  const identity = {
    type: info.type,
    source:
      typeof info.apiName === "string"
        ? `api::${info.apiName}`
        : typeof info.pluginName === "string"
          ? `plugin::${info.pluginName}`
          : "",
    method: method.trim().toUpperCase(),
    path: path.trim(),
  };
  identityCache.set(value, identity);
  return identity;
}
const mountedLayerSchema = z.looseObject({
  path: z.string(),
  methods: z.array(z.string()).min(1),
});
function mountedLayerShape(
  value: unknown,
): value is z.output<typeof mountedLayerSchema> {
  return mountedLayerSchema.safeParse(value).success;
}
/**
 * Uses the content API's mounted stack when available, otherwise the server stack.
 * Returns `undefined` if neither stack is available.
 *
 * @remarks
 * Returns the original valid layers. Skips middleware layers with no methods
 * and passes other malformed layers to `onInvalid`.
 */
export function koaContentRoutes(
  app: App,
  onInvalid?: (layer: unknown) => void,
): { path: string; methods: string[] }[] | undefined {
  const server = app.server as unknown as {
    listRoutes?: () => unknown[];
    api?: (name: string) => { listRoutes?: () => unknown[] };
  };
  const api = server.api?.("content-api");
  const stack = api?.listRoutes?.() ?? server.listRoutes?.();
  if (!stack) return;
  return stack.filter((layer): layer is z.output<typeof mountedLayerSchema> => {
    if (mountedLayerShape(layer)) return true;
    // Koa also registers middleware layers without any route methods.
    if (
      !(
        object(layer) &&
        Array.isArray(layer.methods) &&
        layer.methods.length === 0
      )
    )
      onInvalid?.(layer);
    return false;
  });
}

/** Starts the app's HTTP server on loopback with an OS-assigned port and waits until it accepts connections. */
export async function listenForTests(app: App): Promise<Server> {
  const server = app.server.httpServer;
  const listening = once(server, "listening");
  app.server.listen(0, "127.0.0.1");
  await listening;
  return server;
}
/** Removes trailing slashes from the REST prefix and uses `/api` if it is absent or invalid. */
export function restPrefix(app: App): string {
  const value = getConfig<unknown>(app, "api.rest.prefix", "/api");
  if (typeof value === "string" && (value === "" || value.startsWith("/")))
    return value.replace(/\/+$/, "");
  warn(app, "Invalid api.rest.prefix; using /api");
  return "/api";
}
/** Uses `server.url` without trailing slashes, or builds an HTTP URL from the configured host and port. */
export function serverUrl(app: App): string {
  const url = getConfig<unknown>(app, "server.url", "");
  if (typeof url === "string" && url.trim()) return url.replace(/\/+$/, "");
  if (typeof url !== "string")
    warn(app, "Invalid server.url; deriving it from host and port");
  const host = getConfig(app, "server.host", "localhost");
  const port = getConfig<number | string>(app, "server.port", 1337);
  const authority =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${authority}:${port}`;
}

export type Probe = {
  name: string;
  status: "ok" | "failed" | "skipped";
  detail: string;
};
/** Reports adapter compatibility at boot. `ok` means no check failed, even if some checks were skipped. */
export function probe(app: App, routers: Router[]) {
  const checks: Probe[] = [];
  const check = (name: string, fn: () => string | undefined) => {
    try {
      const detail = fn();
      checks.push({
        name,
        status: detail === undefined ? "skipped" : "ok",
        detail: detail ?? "Not available at boot",
      });
    } catch (error) {
      checks.push({
        name,
        status: "failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const content = routers.filter((r) => r.type === "content-api");
  const routes = content.flatMap((r) => r.routes);
  const invalidLayers: string[] = [];
  check("Route enumeration", () => {
    if (!content.length) throw new Error("No content-api routers found");
    const koa = koaContentRoutes(app, (layer) =>
      invalidLayers.push(object(layer) ? String(layer.path) : String(layer)),
    );
    if (koa && routes.length > koa.length)
      throw new Error(
        `${routes.length} catalog routes exceed ${koa.length} mounted Koa routes`,
      );
    return `${content.length} routers; bare plugin arrays are admin${koa ? `; ${koa.length} Koa routes` : ""}`;
  });
  check("Route fields", () => {
    if (invalidLayers.length)
      throw new Error(
        `Invalid mounted Koa routes: ${invalidLayers.join(", ")}`,
      );
    const bad = routes.filter((route) => !routeShape(route));
    if (bad.length)
      throw new Error(
        `Invalid route entries: ${bad.map((route) => (object(route) ? `${route.method} ${route.path}` : String(route))).join(", ")}`,
      );
    return `${routes.length} checked`;
  });
  check("Request route identity", () => undefined);
  check("App Zod", () => {
    const z = getZod(app);
    let count = 0;
    for (const router of content) {
      for (const route of router.routes) {
        if (!routeShape(route)) continue; // Reported by Route fields.
        const label = `${router.source.kind}::${router.source.name} ${route.method} ${route.path}`;
        for (const group of ["query", "params", "body"] as const) {
          const entries = route.request?.[group];
          if (entries === undefined) continue;
          if (!object(entries))
            throw new Error(`${label}: request.${group} must be a schema map`);
          for (const [key, schema] of Object.entries(entries)) {
            if (!(schema instanceof z.ZodType))
              throw new Error(
                `${label}: request.${group}.${key} must use the app's Zod v4`,
              );
            count++;
          }
        }
        if (route.response == null) continue;
        try {
          for (const entry of normalizeRouteResponse(route.response, z))
            if (entry.schema !== null) count++;
        } catch (cause) {
          throw new Error(
            `${label}: invalid response: ${cause instanceof Error ? cause.message : String(cause)}`,
            { cause },
          );
        }
      }
    }
    return count ? `${count} route schemas share app Zod` : undefined;
  });
  check("Configuration and models", () => {
    if (
      typeof app.config?.get !== "function" ||
      !object(app.contentTypes) ||
      !object(app.components)
    )
      throw new Error("Missing app config or model registries");
    return `${serverUrl(app)}${restPrefix(app)}`;
  });
  check("Alternate response headers", () =>
    Object.values(variantHeaders).join(", "),
  );
  const failures = checks.filter((c) => c.status === "failed");
  return { ok: failures.length === 0, failures, checks };
}
