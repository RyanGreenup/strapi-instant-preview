import type { ZodType } from "zod/v4";

import { STATUS_CODES } from "node:http";

import type { App } from "../adapter";
import type { Config } from "../config";
import type { Contract } from "../contract";
import type { JSONSchema } from "./schemas";

import {
  appDir,
  getConfig,
  getZod,
  models,
  pluginName,
  readManifest,
  restPrefix,
  serverUrl,
} from "../adapter";
import { collectRoutes } from "../catalog";
import { resolveConfig } from "../config";
import { resolveContracts } from "../contract";
import { createSchemas, fileUid } from "../schemas";
import { exampleObject, requiredKeys } from "./examples";
import { createFilters } from "./filters";
import { createModelFields } from "./model-fields";
import { createPaging } from "./paging";
import { buildQueryParameters } from "./parameters";
import { schemaConverter } from "./schemas";
import { selfCheck } from "./self-check";

type Content = Record<
  string,
  {
    schema: JSONSchema;
    examples?: Record<string, { summary: string; value: unknown }>;
  }
>;
type Parameter = {
  name: string;
  in: "path" | "query";
  required: boolean;
  schema: JSONSchema;
  style?: "deepObject";
  explode?: boolean;
};
// OpenAPI cannot make a schema depend on a query parameter. These extensions
// name the exact schema for each `status` value, so a status-aware validator or
// client can pick it instead of the union in the operation.
export type StatusSchemas = {
  parameter: "status";
  default: "published";
  schemas: { published: JSONSchema; draft: JSONSchema };
};
export type Operation = {
  operationId: string;
  tags: string[];
  security: { bearerAuth?: string[] }[];
  parameters?: Parameter[];
  requestBody?: { required: boolean; description?: string; content: Content };
  responses: Record<string, { description: string; content?: Content }>;
  "x-strapi-request-status"?: StatusSchemas;
  "x-strapi-response-status"?: StatusSchemas & { status: number };
  "x-strapi-single-type-write"?: SingleTypeWrite;
};
/**
 * A single type's PUT: `create` applies when no document exists, `update`
 * otherwise. With draft and publish, each is a map by `status` value, and
 * `statusParameter` names the parameter that selects it.
 */
export type SingleTypeWrite = {
  condition: "document exists";
  create: JSONSchema | StatusSchemas["schemas"];
  update: JSONSchema | StatusSchemas["schemas"];
  statusParameter?: "status";
};
/** OpenAPI 3.1 document whose `paths` omit the REST prefix in the default server URL. */
export type OpenAPIDocument = {
  openapi: "3.1.0";
  info: { title: string; version: string; description?: string };
  servers: NonNullable<Config["servers"]>;
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, JSONSchema>;
    securitySchemes: {
      bearerAuth: { type: "http"; scheme: "bearer"; description: string };
    };
  };
};
/**
 * Identifies the response contract source for each emitted operation.
 * Notices flag customized core actions that still use core response schemas.
 */
export type Coverage = {
  routes: {
    method: string;
    path: string;
    handler: string;
    source: Contract["source"];
    customized?: string[];
  }[];
  warnings: string[];
  notices: string[];
};

type RequestGroup = Record<string, ZodType>;
type Request = {
  query?: RequestGroup;
  params?: RequestGroup;
  body?: RequestGroup;
};

/**
 * Builds a fresh OpenAPI 3.1 contract from a loaded Strapi app.
 *
 * @remarks
 * `includePlugins` limits the emitted operations, but response contracts resolve against the full route catalog.
 *
 * @param overrides - Top-level config values that replace the app's plugin config values for this call.
 * @returns The document and coverage report for export, plus the included routes, resolved contracts, schemas, and models for response validation.
 * @throws If the config, route catalog, or generated contract is invalid.
 * In strict mode (the default), an uncovered operation or a schema warning also causes an error.
 */
export function assemble(app: App, overrides?: Partial<Config>) {
  const resolved = resolveConfig(app, overrides);
  if (resolved.ok === false) {
    throw new Error(
      `Cannot generate OpenAPI contract: ${resolved.error.message}`,
      { cause: resolved.error },
    );
  }
  const config = resolved.value;
  const allRoutes = collectRoutes(app);
  const routes = config.includePlugins
    ? allRoutes.filter(
        (route) =>
          route.source.kind === "api" ||
          config.includePlugins!.includes(route.source.name),
      )
    : allRoutes;
  const z = getZod(app);
  const appModels = models(app);
  const schemas = createSchemas(z, appModels, {
    ...config,
    strictRelations:
      getConfig<unknown>(app, "api.documents.strictRelations", false) === true,
  });
  const fields = createModelFields(appModels);
  // One decision with the relation schemas and the query-mode checker. Only
  // relations a client can populate: the same private rule as the populate
  // catalog, and no admin models (they have no Content API).
  const countless = Object.keys({
    ...appModels.contentTypes,
    ...appModels.components,
  })
    .filter((uid) => !uid.startsWith("admin::"))
    .flatMap((uid) =>
      fields
        .get(uid)
        .attributes.filter(
          ({ name, private: hidden }) =>
            !hidden && schemas.relationCount(uid, name) === "no",
        )
        .map(({ name }) => `${uid}.${name}`),
    )
    .sort();
  const filters = createFilters(z, fields, schemas.registry);
  const paging = createPaging(z, fields, schemas.registry);
  const contracts = resolveContracts(app, z, allRoutes, schemas);
  const manifest = readManifest(appDir(app));
  const components: Record<string, JSONSchema> = Object.create(null);
  const convert = schemaConverter(z, schemas.registry, components);
  const document: OpenAPIDocument = {
    openapi: "3.1.0",
    info: {
      title: manifest.name ?? "Strapi Content API",
      version: manifest.version ?? "1.0.0",
      ...(typeof manifest.description === "string" &&
        manifest.description && { description: manifest.description }),
      ...config.info,
    },
    servers: config.servers ?? [{ url: `${serverUrl(app)}${restPrefix(app)}` }],
    paths: Object.create(null),
    components: {
      schemas: components,
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Strapi API token or user JWT",
        },
      },
    },
  };
  const ids = new Set<string>();
  const coverage: Coverage = { routes: [], warnings: [], notices: [] };
  for (const schema of [
    schemas.error,
    schemas.count,
    schemas.blocks,
    ...(appModels.contentTypes[fileUid] ? [schemas.file] : []),
  ]) {
    convert(schema, "output", "shared components");
  }

  for (const route of routes) {
    const contract = contracts.get(route.key);
    if (!contract) throw new Error(`No contract entry for ${route.key}`);
    const customized =
      contract.source === "core" ? route.coreAction?.customizations : undefined;
    coverage.routes.push({
      method: route.method,
      path: route.openapiPath,
      handler: route.handler,
      source: contract.source,
      ...(customized && { customized }),
    });
    if (customized)
      coverage.notices.push(
        `${route.method} ${route.openapiPath} uses the core ${route.coreAction!.action} response, but the project customizes it (${customized.join(", ")}). ` +
          "Declare its responses if the shape changes, and check responses at runtime.",
      );
    const path = (document.paths[route.openapiPath] ??= Object.create(null));
    const method = route.method.toLowerCase();
    if (Object.hasOwn(path, method))
      throw new Error(
        `Duplicate OpenAPI operation ${route.method} ${route.openapiPath}`,
      );
    const base = route.handler
      .replace(/^([^:]+)::/, "$1.")
      .replace(/[^\w.-]/g, "_");
    let id = base;
    for (let index = 2; ids.has(id); index++) id = `${base}.${index}`;
    ids.add(id);
    const isSpecRoute =
      route.source.kind === "plugin" &&
      route.source.name === pluginName &&
      route.rawPath === "/openapi-contract/spec.json";
    const operation: Operation = (path[method] = {
      operationId: id,
      tags: [route.source.name],
      security:
        route.auth === "none"
          ? []
          : isSpecRoute || config.requireBearer
            ? [{ bearerAuth: [] }]
            : [{ bearerAuth: [] }, {}],
      responses: Object.create(null),
    });
    const upstream = route.upstream.request as Request | undefined;
    const request: Request = {
      query: { ...upstream?.query, ...contract.request?.query },
      params: { ...upstream?.params, ...contract.request?.params },
      body: { ...upstream?.body, ...contract.request?.body },
    };
    const core = route.coreAction;
    const queryUid =
      core?.uid ??
      (contract.queryModel &&
      Object.hasOwn(appModels.contentTypes, contract.queryModel)
        ? contract.queryModel
        : undefined);
    if (queryUid && request.query) {
      const query = request.query;
      const read = core?.action === "find" || core?.action === "findOne";
      const replace = (name: "filters" | "pagination" | "sort") =>
        core
          ? (name !== "filters" || upstream?.query?.filters) &&
            (read || upstream?.query?.[name]) &&
            query[name] === upstream?.query?.[name]
          : query[name] !== undefined;
      for (const [name, replacement] of [
        ["filters", () => filters(queryUid).optional()],
        ["pagination", () => paging.pagination],
        ["sort", () => paging.sort(queryUid)],
      ] as const) {
        if (replace(name)) query[name] = replacement();
      }
    }
    if (core?.action === "delete" && request.query?.status) {
      request.query.status = z
        .literal("published")
        .optional()
        .describe(
          "Only published deletion is supported; status=draft fails with a server error.",
        );
    }
    const convertInput = (schema: ZodType, origin: string) =>
      convert(schema, "input", `${route.key} (${origin})`);
    const parameters: Parameter[] = route.pathParams.map(
      ({ name: originalName, pattern }, index) => {
        const name = route.canonicalParamNames[index];
        const declared =
          route.coreAction && originalName === "id"
            ? z
                .string()
                .min(1)
                .regex(/^[^\x00]+$/)
                .describe(
                  "The document ID (documentId), not the numeric row ID.",
                )
            : request.params?.[originalName];
        const schema: JSONSchema = declared
          ? { ...convertInput(declared, `path parameter ${originalName}`) }
          : { type: "string" };
        if (pattern !== undefined) {
          if (schema.pattern !== undefined || schema.$ref)
            return {
              name,
              in: "path",
              required: true,
              schema: { allOf: [schema, { type: "string", pattern }] },
            };
          schema.pattern = pattern;
        }
        return { name, in: "path", required: true, schema };
      },
    );
    parameters.push(
      ...buildQueryParameters(
        request.query,
        convertInput,
        components,
        core
          ? upstream?.query?.fields
          : queryUid
            ? request.query?.fields
            : undefined,
        queryUid
          ? {
              schema: core
                ? upstream?.query?.populate
                : request.query?.populate,
              uid: queryUid,
              fields,
              filters: (uid) =>
                convertInput(filters(uid), `populate filters (${uid})`),
              sort: (uid) =>
                convertInput(
                  paging.populateSort(uid),
                  `populate sort (${uid})`,
                ),
              exactUpstream: !!core && route.source.kind === "api",
              countless,
            }
          : undefined,
      ),
    );
    if (parameters.length) operation.parameters = parameters;
    if (
      core &&
      (core.action === "create" || core.action === "update") &&
      !contract.request?.body
    ) {
      const update = core.action === "update";
      const published = z.object({ data: schemas.input(core.uid, update) });
      if (appModels.contentTypes[core.uid].options?.draftAndPublish) {
        const draft = z.object({ data: schemas.input(core.uid, update, true) });
        // The union keeps the body sound for any status; the extension restores
        // the published constraints for a validator that reads the status.
        request.body!["application/json"] = z
          .union([published, draft])
          .describe(
            "Published writes (the default) and draft writes have separate constraints. Set status=draft to use the draft input.",
          );
        operation["x-strapi-request-status"] = {
          parameter: "status",
          default: "published",
          schemas: {
            published: convertInput(published, "published body"),
            draft: convertInput(draft, "draft body"),
          },
        };
      } else {
        request.body!["application/json"] = published;
      }
    }
    // A single type's PUT creates the document when none exists
    // (core-api/service/single-type.ts, createOrUpdate), so a partial body
    // that fits the update input can still fail. JSON Schema cannot check
    // existence: the body stays the broad update input, and the extension names
    // the create and update bodies for a consumer that knows which applies.
    const singleTypeWrite =
      core &&
      core.kind === "singleType" &&
      core.action === "update" &&
      !contract.request?.body
        ? (() => {
            const body = (update: boolean, draft?: boolean) =>
              convertInput(
                z.object({ data: schemas.input(core.uid, update, draft) }),
                `single type ${update ? "update" : "create"} body`,
              );
            const draftAndPublish =
              appModels.contentTypes[core.uid].options?.draftAndPublish ===
              true;
            const byStatus = (update: boolean) =>
              draftAndPublish
                ? { published: body(update), draft: body(update, true) }
                : body(update);
            return {
              condition: "document exists" as const,
              create: byStatus(false),
              update: byStatus(true),
              ...(draftAndPublish && { statusParameter: "status" as const }),
            };
          })()
        : undefined;
    if (singleTypeWrite)
      operation["x-strapi-single-type-write"] = singleTypeWrite;
    const bodies = Object.entries(request.body ?? {});
    if (bodies.length)
      operation.requestBody = {
        required: bodies.every(([, body]) => !body.isOptional()),
        content: Object.fromEntries(
          bodies.map(([media, body]) => [
            media,
            { schema: convertInput(body, media) },
          ]),
        ),
      };
    if (singleTypeWrite && operation.requestBody) {
      const pick = (schema: unknown) =>
        ((schema as Record<string, JSONSchema>).published ??
          schema) as JSONSchema;
      const data = (schema: JSONSchema) =>
        (schema.properties as Record<string, JSONSchema> | undefined)?.data;
      const statusNote = singleTypeWrite.statusParameter
        ? "; the status query parameter selects the published or draft rules separately."
        : ".";
      operation.requestBody.description = [
        "Creates the document when none exists, so the body must then match the create schema (every required field).",
        "When the document exists, it is updated and a partial body is enough.",
        "This schema accepts the update form; JSON Schema cannot check whether the document exists.",
        `See x-strapi-single-type-write for both schemas${statusNote}`,
      ].join(" ");
      const content = operation.requestBody.content["application/json"];
      if (content)
        content.examples = {
          create: {
            summary: "No document exists yet: send every required field",
            value: {
              data: exampleObject(
                data(pick(singleTypeWrite.create)),
                components,
                false,
              ),
            },
          },
          update: {
            summary: "The document exists: send only the fields to change",
            value: {
              data: exampleObject(
                data(pick(singleTypeWrite.update)),
                components,
                true,
                requiredKeys(data(pick(singleTypeWrite.create)), components),
              ),
            },
          },
        };
    }
    for (const [status, schema] of [...contract.responses].sort(
      ([a], [b]) => a - b,
    )) {
      operation.responses[status] = {
        description: STATUS_CODES[status] ?? `HTTP ${status}`,
        ...(schema !== null && {
          content: {
            "application/json": {
              schema: convert(schema, "output", `${route.key} (${status})`),
            },
          },
        }),
      };
    }
    if (contract.source === "uncovered")
      operation.responses.default = { description: "Undocumented response" };
    // Reads and writes both default to `published`: the core service passes
    // `status: 'published'` unless the query sets one (CoreService.getFetchParams),
    // and a published write returns the entry that `publish` validated and created.
    const success =
      core?.action === "create"
        ? [...contract.responses.keys()].find(
            (status) => status >= 200 && status < 300,
          )
        : 200;
    if (
      contract.source === "core" &&
      core &&
      success !== undefined &&
      contract.responses.has(success) &&
      ["find", "findOne", "create", "update"].includes(core.action)
    ) {
      const states = schemas.statusResponses(
        core.uid,
        core.kind === "collectionType" && core.action === "find",
      );
      if (states)
        operation["x-strapi-response-status"] = {
          parameter: "status",
          default: "published",
          status: success,
          schemas: {
            published: convert(
              states.published,
              "output",
              `${route.key} (published)`,
            ),
            draft: convert(states.draft, "output", `${route.key} (draft)`),
          },
        };
    }
  }
  coverage.warnings = [...new Set(schemas.warnings)].sort();
  const uncovered = coverage.routes.filter(
    (route) => route.source === "uncovered",
  );
  if (config.strict && (uncovered.length || coverage.warnings.length))
    throw new Error(
      [
        ...uncovered.map(
          (route) => `No response contract for ${route.method} ${route.path}`,
        ),
        ...coverage.warnings,
      ].join("\n"),
    );
  selfCheck(document, routes);
  return { document, coverage, routes, contracts, schemas, models: appModels };
}
