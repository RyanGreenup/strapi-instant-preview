import type { ValidateFunction } from "ajv";
import type { ZodType } from "zod/v4";

import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020";
import { inspect } from "node:util";

import type { App, RouteContext } from "../adapter";
import type { RequestPlan } from "../schemas/presence";
import type { OpenAPIDocument } from "../spec/assemble";

import {
  getConfig,
  getZod,
  logError,
  pluginName,
  restPrefix,
  routeFromCtx,
  variantHeaders,
  warn,
} from "../adapter";
import { joinPath } from "../catalog/path";
import { resolveConfig } from "../config";
import { parsePresence, relationTargets } from "../schemas/presence";
import { assemble } from "../spec/assemble";
import { pointerToken } from "../spec/pointer";

type ViolationKind =
  | "undeclared-status"
  | "unexpected-body"
  | "schema-mismatch"
  | "missing-coverage";
/** Records the original response status, even if the middleware replaces it with HTTP 500. */
export type Violation = {
  route: string;
  status: number;
  kind: ViolationKind;
  issues: string[];
};
/**
 * The relation targets the caller may read, as Strapi's output sanitizer decides
 * it. Undefined when the checker cannot resolve permissions for the request.
 */
type Access = { readable: ReadonlySet<string> } | undefined;
type Check = ((
  status: number,
  body: unknown,
  redirect: boolean,
  query: unknown,
  access: Access,
) => Omit<Violation, "route" | "status"> | undefined) & {
  /** Query mode: the relation targets whose `find` permission decides the projection. */
  targets?: (status: number, query: unknown) => readonly string[];
};
type TestMode = "spec" | "query";
type Runtime = {
  enabled: boolean;
  violations: Violation[];
  document?: OpenAPIDocument;
  failOn: "log" | "error";
  prefix: string;
  lookup: Map<string, Check>;
  includePlugins?: string[];
};
const instances = new WeakMap<App, Runtime>();
const forced = new WeakMap<App, TestMode>();
const middlewareName = `plugin::${pluginName}.validate-responses`;
const json = "application/json";

/**
 * Call before bootstrap to enable response checks in `mode` (`spec` by default)
 * and return HTTP 500 for violations. This does not register the middleware.
 */
export function forceTestValidation(app: App, mode: TestMode = "spec") {
  forced.set(app, mode);
}
/** Returns the app's shared mutable state. Before initialization, checks are off and there are no violations. */
export function runtime(app: App): Runtime {
  let state = instances.get(app);
  if (!state) {
    state = {
      enabled: false,
      failOn: "error",
      prefix: "",
      lookup: new Map(),
      violations: [],
    };
    instances.set(app, state);
  }
  return state;
}

/**
 * Prepares response checks and, if `exposeSpec` is true, the document for the spec endpoint.
 *
 * @remarks
 * Without `plugin::openapi-contract.validate-responses` in `config/middlewares`,
 * checks stay off but the spec can still be exposed. Put this middleware before
 * `strapi::errors` to check the error responses it produces.
 *
 * Assembly and validator compilation failures are logged instead of aborting bootstrap.
 *
 * @throws If the plugin config cannot be read or validated.
 */
export function initializeRuntime(app: App) {
  const mode = forced.get(app);
  const resolved = resolveConfig(
    app,
    mode
      ? { validateResponses: true, validationMode: mode, failOn: "error" }
      : undefined,
  );
  if (resolved.ok === false) {
    throw new Error(
      `Cannot initialize OpenAPI contract runtime: ${resolved.error.message}`,
      { cause: resolved.error },
    );
  }
  const config = resolved.value;
  if (!config.validateResponses && !config.exposeSpec) return;
  const rt = runtime(app);
  const middleware = getConfig<
    (string | { name?: string; resolve?: string })[]
  >(app, "middlewares", []).map((entry) =>
    typeof entry === "string" ? entry : (entry.name ?? entry.resolve),
  );
  const index = middleware.indexOf(middlewareName);
  const errorsIndex = middleware.indexOf("strapi::errors");
  if (config.validateResponses && index < 0)
    logError(
      app,
      `Response validation requires ${middlewareName} in config/middlewares`,
    );
  if (
    config.validateResponses &&
    index >= 0 &&
    errorsIndex >= 0 &&
    index > errorsIndex
  ) {
    warn(
      app,
      `Move ${middlewareName} before strapi::errors to validate caught error bodies`,
    );
  }
  try {
    const { document, contracts, routes, schemas, models } = assemble(
      app,
      config,
    );
    if (config.exposeSpec) rt.document = document;
    if (!config.validateResponses || index < 0) return;
    const z = getZod(app);
    const ajv =
      config.validationMode === "spec"
        ? new Ajv2020({ strict: false, allErrors: true })
        : undefined;
    const id = "urn:openapi-contract:document";
    if (ajv) {
      addFormats(ajv);
      ajv.addFormat("binary", true);
      ajv.addSchema({ $id: id, ...document });
    }
    const lookup = new Map<string, Check>();
    const sharedValidators = new Map<string, ValidateFunction>();
    const prefix = restPrefix(app);
    const withCount = Boolean(
      getConfig<unknown>(app, "api.rest.withCount", true),
    );
    for (const route of routes) {
      const contract = contracts.get(route.key)!;
      const compiled = new Map<number, ValidateFunction>();
      const path = pointerToken(route.openapiPath);
      const method = route.method.toLowerCase();
      const operation = document.paths[route.openapiPath][method];
      // A single `$ref` shares one compiled validator across operations.
      const validatorFor = (emitted: unknown, pointer: string) => {
        const ref =
          emitted &&
          typeof emitted === "object" &&
          Object.keys(emitted).length === 1 &&
          typeof (emitted as { $ref?: unknown }).$ref === "string"
            ? (emitted as { $ref: string }).$ref
            : pointer;
        let validate = sharedValidators.get(ref);
        if (!validate) {
          validate = ajv!.compile({ $ref: `${id}${ref}` });
          sharedValidators.set(ref, validate);
        }
        return validate;
      };
      if (ajv)
        for (const [status, schema] of contract.responses) {
          if (schema === null) continue;
          compiled.set(
            status,
            validatorFor(
              operation.responses[status].content?.[json].schema,
              `#/paths/${path}/${method}/responses/${status}/content/${pointerToken(json)}/schema`,
            ),
          );
        }
      // Spec mode: a default core action with a known `status` query value uses
      // the per-status schema from `x-strapi-response-status`. Custom handlers
      // and other status values keep the ordinary response schema.
      const mapping = operation["x-strapi-response-status"] as
        | { status: number; schemas: Record<string, unknown> }
        | undefined;
      const byStatus =
        ajv &&
        mapping &&
        contract.source === "core" &&
        route.coreAction &&
        !route.coreAction.customizations
          ? {
              status: mapping.status,
              validators: Object.fromEntries(
                (["published", "draft"] as const).map((state) => [
                  state,
                  validatorFor(
                    mapping.schemas[state],
                    `#/paths/${path}/${method}/x-strapi-response-status/schemas/${state}`,
                  ),
                ]),
              ) as Record<"published" | "draft", ValidateFunction>,
            }
          : undefined;
      const statusValidator = (status: number, query: unknown) => {
        if (!byStatus || status !== byStatus.status) return;
        const requested =
          query && typeof query === "object"
            ? (query as { status?: unknown }).status
            : undefined;
        if (requested === undefined) return byStatus.validators.published;
        if (requested === "published" || requested === "draft")
          return byStatus.validators[requested];
      };
      const koaRedirect =
        contract.source === "built-in" &&
        [
          "plugin::users-permissions.auth.connect",
          "plugin::users-permissions.auth.emailConfirmation",
        ].includes(route.handler);
      // Query mode: the success response of a default core action follows the
      // request's fields, populate, status and pagination. Anything else, and
      // any query the parser does not model, uses the static Zod schema.
      const core =
        config.validationMode === "query" &&
        contract.source === "core" &&
        route.coreAction &&
        !route.coreAction.customizations &&
        route.coreAction.action !== "delete"
          ? route.coreAction
          : undefined;
      const success = core?.action === "create" ? 201 : 200;
      const plans = new Map<string, RequestPlan | undefined>();
      const planFor = (query: unknown) => {
        if (!core) return;
        const key = JSON.stringify(query ?? {});
        if (plans.has(key)) return plans.get(key);
        const plan = parsePresence(models, core.uid, query, { withCount });
        if (plans.size >= 200) plans.delete(plans.keys().next().value!);
        plans.set(key, plan);
        return plan;
      };
      // Keyed by the raw query and the readable targets: the same query can
      // project differently for callers with different permissions.
      const perQuery = new Map<string, ZodType | undefined>();
      const querySchema = (
        query: unknown,
        access: Access,
      ): ZodType | undefined => {
        if (!core) return;
        const key = `${JSON.stringify(query ?? {})}|${access ? [...access.readable].sort().join(",") : "?"}`;
        if (perQuery.has(key)) return perQuery.get(key);
        const plan = planFor(query);
        const schema =
          plan &&
          schemas.queryResponse(
            core.uid,
            core.kind === "collectionType" && core.action === "find",
            plan,
            access,
          );
        if (perQuery.size >= 200)
          perQuery.delete(perQuery.keys().next().value!);
        perQuery.set(key, schema);
        return schema;
      };
      const check: Check = (status, body, redirect, query, access) => {
        const schema =
          (status === success && querySchema(query, access)) ||
          contract.responses.get(status);
        if (schema === undefined)
          return { kind: "undeclared-status", issues: [] };
        if (schema === null) {
          if (body != null && !(koaRedirect && status === 302 && redirect))
            return { kind: "unexpected-body", issues: [] };
          return;
        }
        const validate = statusValidator(status, query) ?? compiled.get(status);
        if (validate) {
          if (!validate(body))
            return {
              kind: "schema-mismatch",
              issues: (validate.errors ?? [])
                .slice(0, 10)
                .map(
                  (issue) => `${issue.instancePath || "/"}: ${issue.message}`,
                ),
            };
          return;
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return {
            kind: "schema-mismatch",
            issues: [
              z.prettifyError({
                ...parsed.error,
                issues: parsed.error.issues.slice(0, 10),
              }),
            ],
          };
        }
      };
      if (core)
        check.targets = (status, query) => {
          if (status !== success) return [];
          const plan = planFor(query);
          return plan ? relationTargets(plan) : [];
        };
      lookup.set(`${route.method} ${joinPath(prefix, route.fullPath)}`, check);
      const fallback = `${route.source.kind}::${route.source.name} ${route.method} ${route.rawPath}`;
      if (!lookup.has(fallback)) lookup.set(fallback, check);
    }
    Object.assign(rt, {
      enabled: true,
      lookup,
      prefix,
      failOn: config.failOn,
      includePlugins: config.includePlugins,
    });
  } catch (error) {
    logError(
      app,
      `Contract initialization failed; response checks disabled: ${inspect(error, { depth: 5 })}`,
    );
  }
}

type Context = RouteContext & {
  method: string;
  status: number;
  body: unknown;
  query: unknown;
  state: { auth?: unknown };
  get(name: string): string;
  response: { get(name: string): string };
};

type Verifier = {
  auth?: { verify?: (auth: unknown, config: { scope: string }) => unknown };
};

/**
 * Which `targets` the caller may read, by the check Strapi's output sanitizer
 * makes (`removeRestrictedRelations`: `<uid>.find`). Undefined without request
 * auth or a verifier, so the checker treats the projection as unknown.
 */
async function readableTargets(
  app: App,
  auth: unknown,
  targets: readonly string[],
): Promise<Access> {
  const verify = (app as unknown as Verifier).auth?.verify;
  if (auth === undefined || auth === null || typeof verify !== "function")
    return;
  // A rejected scope means Strapi removes the relation from the response.
  const decisions = await Promise.all(
    targets.map(async (uid) => {
      try {
        await verify.call((app as unknown as Verifier).auth, auth, {
          scope: `${uid}.find`,
        });
        return uid;
      } catch {
        return undefined;
      }
    }),
  );
  return {
    readable: new Set(
      decisions.filter((uid): uid is string => uid !== undefined),
    ),
  };
}

/**
 * Checks Content API responses after downstream middleware returns.
 *
 * @remarks
 * Skips `HEAD`, requests for the v4 format or source maps, buffers, and streams,
 * and plugin routes left out by `includePlugins`. These are intentional
 * exclusions. A content route the checker cannot cover (invalid route metadata
 * for a catalog match, or no catalog entry) is recorded as a `missing-coverage`
 * violation for that route only; checks stay on for every other route and the
 * response is left unchanged.
 */
export default function validateResponses(
  _cfg: unknown,
  { strapi }: { strapi: App },
) {
  const rt = runtime(strapi);
  const uncovered = (route: string, status: number, reason: string) => {
    rt.violations.push({
      route,
      status,
      kind: "missing-coverage",
      issues: [reason],
    });
    logError(strapi, `${route}: ${reason}; response not checked`);
  };
  return async (ctx: Context, next: () => Promise<unknown>) => {
    await next();
    if (
      !rt.enabled ||
      ctx.method === "HEAD" ||
      ctx.get(variantHeaders.format) === "v4" ||
      ctx.get(variantHeaders.sourceMaps)
    )
      return;
    if (
      Buffer.isBuffer(ctx.body) ||
      (ctx.body &&
        typeof ctx.body === "object" &&
        "pipe" in ctx.body &&
        typeof ctx.body.pipe === "function")
    )
      return;
    const { matched, identity } = routeFromCtx(ctx);
    const check =
      matched && rt.lookup.get(`${ctx.method} ${joinPath(matched)}`);
    if (!identity) {
      if (check)
        uncovered(
          `${ctx.method} ${matched}`,
          ctx.status,
          "invalid ctx.state.route for a matched content route",
        );
      return;
    }
    if (identity.type !== "content-api") return;
    if (
      identity.source.startsWith("plugin::") &&
      rt.includePlugins &&
      !rt.includePlugins.includes(identity.source.slice(8))
    )
      return;
    const route = `${ctx.method} ${matched ?? identity.path}`;
    const validate =
      check ||
      rt.lookup.get(`${identity.source} ${ctx.method} ${identity.path}`);
    if (!validate) {
      uncovered(route, ctx.status, "no catalog entry");
      return;
    }
    const targets = validate.targets?.(ctx.status, ctx.query) ?? [];
    const access = targets.length
      ? await readableTargets(strapi, ctx.state.auth, targets)
      : { readable: new Set<string>() };
    const problem = validate(
      ctx.status,
      ctx.body,
      !!ctx.response.get("Location"),
      ctx.query,
      access,
    );
    if (!problem) return;
    rt.violations.push({ route, status: ctx.status, ...problem });
    logError(
      strapi,
      `${route} returned ${ctx.status}: ${problem.kind}${problem.issues.length ? `\n${problem.issues.join("\n")}` : ""}`,
    );
    if (rt.failOn === "error") {
      ctx.status = 500;
      ctx.body = {
        data: null,
        error: { status: 500, name: "ContractViolation", message: route },
      };
    }
  };
}
