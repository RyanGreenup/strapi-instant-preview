import type { App, Model, Probe, Source } from "../adapter";
import type { PathParam } from "./path";

import {
  koaContentRoutes,
  listRouters,
  models,
  probe,
  restPrefix,
  routeShape,
  testedVersions,
  version,
  warn,
} from "../adapter";
import { joinPath, normalizePath } from "./path";

type CatalogCheck = Probe & { error?: Error };

const methods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
] as const;
type Method = (typeof methods)[number];
type CoreAction = {
  uid: string;
  kind: "collectionType" | "singleType";
  action: "find" | "findOne" | "create" | "update" | "delete";
  customizations?: ("controller" | "service" | "policies" | "middlewares")[];
};
/**
 * The route key uses the HTTP method and path without the REST prefix.
 * `pathParams` retains the original parameter names. `canonicalParamNames`
 * gives the names in `openapiPath`, in the same order.
 */
export type RouteEntry = {
  key: string;
  method: Method;
  fullPath: string;
  openapiPath: string;
  pathParams: PathParam[];
  templateShape: string;
  canonicalParamNames: string[];
  rawPath: string;
  source: Source;
  handler: string;
  coreAction?: CoreAction;
  auth: "none" | "optional";
  upstream: { request?: unknown; response?: unknown };
};

function classify(
  handler: string,
  method: string,
  path: string,
  types: Record<string, Model>,
): CoreAction | undefined {
  const dot = handler.lastIndexOf(".");
  const uid = handler.slice(0, dot);
  const type = types[uid];
  if (!type) return;
  const action = handler.slice(dot + 1);
  const { kind, info } = type;
  if (kind !== "collectionType" && kind !== "singleType") return;
  const base = `/${kind === "collectionType" ? info.pluralName : info.singularName}`;
  const item = kind === "collectionType" ? `${base}/:id` : base;
  if (
    (action === "find" && method === "GET" && path === base) ||
    (action === "findOne" &&
      kind === "collectionType" &&
      method === "GET" &&
      path === item) ||
    (action === "create" &&
      kind === "collectionType" &&
      method === "POST" &&
      path === base) ||
    (action === "update" && method === "PUT" && path === item) ||
    (action === "delete" && method === "DELETE" && path === item)
  )
    return { uid, kind, action };
}

function overrides(target: unknown, method: string): boolean {
  if (target === null || typeof target !== "object") return false;
  const own = (target as Record<string, unknown>)[method];
  const base = (
    Object.getPrototypeOf(target) as Record<string, unknown> | null
  )?.[method];
  return typeof own === "function" && own !== base;
}

function customizations(
  app: App,
  core: CoreAction,
  handler: string,
  config: unknown,
): NonNullable<CoreAction["customizations"]> {
  const found: NonNullable<CoreAction["customizations"]> = [];
  const lookup = (get: () => unknown) => {
    try {
      return get();
    } catch {
      return undefined;
    }
  };
  const controller = lookup(() =>
    app.controller(handler.slice(0, handler.lastIndexOf(".")) as never),
  );
  if (overrides(controller, core.action)) found.push("controller");
  const serviceMethod =
    core.kind === "singleType" && core.action === "update"
      ? "createOrUpdate"
      : core.action;
  if (
    overrides(
      lookup(() => app.service(core.uid as never)),
      serviceMethod,
    )
  )
    found.push("service");
  const settings = (config ?? {}) as {
    policies?: unknown;
    middlewares?: unknown;
  };
  if (Array.isArray(settings.policies) && settings.policies.length)
    found.push("policies");
  if (Array.isArray(settings.middlewares) && settings.middlewares.length)
    found.push("middlewares");
  return found;
}

/**
 * Inspects Content API routes in the Strapi app. The result can contain partial
 * routes alongside failed checks. Routes sort by key.
 */
export function inspectCatalog(app: App) {
  const routes: RouteEntry[] = [];
  let checks: CatalogCheck[];
  try {
    const routers = listRouters(app);
    checks = probe(app, routers).checks;
    const keys = new Set<string>();
    const contentTypes = models(app).contentTypes;
    const mounted = koaContentRoutes(app);
    const mountedKeys =
      mounted &&
      new Set(
        mounted.flatMap((layer) =>
          layer.methods.map((method) => `${method} ${layer.path}`),
        ),
      );
    const prefix = restPrefix(app);
    for (const router of routers) {
      if (router.type !== "content-api") continue;
      for (const route of router.routes) {
        if (!routeShape(route)) continue;
        const rawPath = route.path.trim();
        const rawMethod = route.method.trim().toUpperCase();
        const handler =
          typeof route.handler === "string" ? route.handler.trim() : "inline";
        const qualified = handler.includes("::")
          ? handler
          : `${router.source.kind}::${router.source.name}.${handler}`;
        const routerPrefix =
          route.config && Object.hasOwn(route.config, "prefix")
            ? ""
            : router.prefix;
        const fullPath = joinPath(routerPrefix, rawPath);
        const mountedPath =
          `${prefix}${routerPrefix.replace(/\/$/, "")}${rawPath === "/" && (prefix || routerPrefix) ? "" : rawPath}` ||
          "/";
        const all = rawMethod === "ALL";
        const verbs = all
          ? methods.filter(
              (method) =>
                !mountedKeys || mountedKeys.has(`${method} ${mountedPath}`),
            )
          : [rawMethod as Method];
        try {
          if (
            !verbs.length ||
            verbs.some((method) => !methods.includes(method))
          )
            throw new Error(`Unsupported method ${rawMethod}`);
          const normalized = normalizePath(fullPath);
          if (normalized.ok === false) {
            const name = `${rawMethod} ${fullPath}`;
            const detail = `${router.source.kind}::${router.source.name}: ${normalized.error.message}`;
            checks.push({
              name,
              status: "failed",
              detail,
              error: new Error(`${name} (${detail})`, {
                cause: normalized.error,
              }),
            });
            continue;
          }
          const canonicalParamNames = normalized.value.pathParams.map(
            (param) => param.name,
          );
          for (const method of verbs) {
            const key = `${method} ${fullPath}`;
            if (keys.has(key)) throw new Error(`Duplicate route: ${key}`);
            if (
              mountedKeys &&
              !mountedKeys.has(`${method} ${mountedPath}`) &&
              !mountedKeys.has(`${method} ${mountedPath}/`)
            ) {
              throw new Error(
                `Route not found in Koa stack: ${method} ${mountedPath}`,
              );
            }
            keys.add(key);
            const coreAction = classify(
              qualified,
              method,
              joinPath(rawPath),
              contentTypes,
            );
            if (coreAction) {
              const found = customizations(
                app,
                coreAction,
                qualified,
                route.config,
              );
              if (found.length) coreAction.customizations = found;
            }
            routes.push({
              key,
              method,
              fullPath,
              rawPath,
              ...normalized.value,
              canonicalParamNames,
              source: router.source,
              handler: qualified,
              coreAction,
              auth: route.config?.auth === false ? "none" : "optional",
              upstream: { request: route.request, response: route.response },
            });
          }
        } catch (error) {
          checks.push({
            name: `${rawMethod} ${fullPath}`,
            status: "failed",
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } catch (error) {
    checks = [
      {
        name: "Route enumeration",
        status: "failed",
        detail: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  const installed = version(app);
  if (!testedVersions.includes(installed))
    warn(
      app,
      `Strapi ${installed} is not a tested version (${testedVersions.join(", ")}); running adapter probes`,
    );
  const failures = checks.filter((check) => check.status === "failed");
  routes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const templates = new Map<string, RouteEntry>();
  for (const route of routes) {
    const first = templates.get(route.templateShape);
    if (first) {
      route.openapiPath = first.openapiPath;
      route.canonicalParamNames = first.canonicalParamNames;
    } else {
      templates.set(route.templateShape, route);
    }
  }
  return { routes, checks, failures, ok: failures.length === 0 };
}

/**
 * Returns Content API routes only after all adapter checks pass.
 *
 * @param includePlugins - Plugin names to retain. App routes are always retained.
 * @throws If any adapter check fails, even for a plugin outside `includePlugins`.
 */
export function collectRoutes(app: App, includePlugins?: string[]) {
  const result = inspectCatalog(app);
  if (!result.ok) {
    const message = `Strapi adapter checks failed:\n${result.failures.map((check) => `${check.name}: ${check.detail}`).join("\n")}`;
    const errors = result.failures.flatMap((check) =>
      check.error ? [check.error] : [],
    );
    if (errors.length) throw new AggregateError(errors, message);
    throw new Error(message);
  }
  return includePlugins
    ? result.routes.filter(
        (route) =>
          route.source.kind === "api" ||
          includePlugins.includes(route.source.name),
      )
    : result.routes;
}
