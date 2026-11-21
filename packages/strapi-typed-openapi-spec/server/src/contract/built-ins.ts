import type { Zod } from "../adapter";
import type { RouteEntry } from "../catalog";
import type { Schemas } from "../schemas";
import type { RouteResponse } from "./declarations";
import type { RequestOverlay } from "./index";
import type { UsersPermissionsOptions } from "./users-permissions";

import { modelResponse } from "./model-response";
import { uploadContracts } from "./upload";
import { usersPermissionsContracts } from "./users-permissions";

export interface BuiltInContract {
  response: RouteResponse;
  request?: RequestOverlay;
  queryModel?: string;
}

// Re-exported for the unit tests, which load it from built-ins.
export { modelResponse } from "./model-response";

type PluginTable = (
  route: RouteEntry,
  action: string,
) => BuiltInContract | undefined;

/**
 * Creates a lookup for qualified plugin handlers. The lookup creates each
 * plugin's table on demand and returns `undefined` for unsupported handlers.
 */
export function builtIns(
  z: Zod,
  schemas: Schemas,
  usersPermissions: UsersPermissionsOptions = {},
) {
  const tables = new Map<string, PluginTable>();
  return (route: RouteEntry): BuiltInContract | undefined => {
    const name = route.source.name;
    const prefix = `plugin::${name}.`;
    if (!route.handler.startsWith(prefix)) return;
    const action = route.handler.slice(prefix.length);
    let table = tables.get(name);
    if (!table) {
      switch (name) {
        case "upload":
          table = uploadContracts(z, schemas);
          break;
        case "users-permissions":
          table = usersPermissionsContracts(z, schemas, usersPermissions);
          break;
        case "content-type-builder":
          table = contentTypeBuilderContracts(z);
          break;
        case "email":
          table = emailContracts(z);
          break;
        case "i18n":
          table = i18nContracts(z, schemas);
          break;
        default:
          return undefined;
      }
      tables.set(name, table);
    }
    return table(route, action);
  };
}

function contentTypeBuilderContracts(z: Zod): PluginTable {
  const kind = z.enum(["collectionType", "singleType"]);
  const record = z.record(z.string(), z.unknown());
  const schema = z.looseObject({
    displayName: z.string(),
    description: z.string(),
    collectionName: z.string().optional(),
    pluginOptions: record.optional(),
    attributes: z.record(z.string(), z.looseObject({ type: z.string() })),
  });
  const modelUid = z.string().regex(/^(?:api|plugin|admin)::[\w.-]+$/);
  const componentUid = z.string().regex(/^[\w-]+\.[\w-]+$/);
  const contentType = z.object({
    uid: modelUid,
    plugin: z.string().optional(),
    apiID: z.string(),
    schema: schema.extend({
      singularName: z.string().optional(),
      pluralName: z.string().optional(),
      kind,
      draftAndPublish: z.boolean().optional(),
      visible: z.boolean(),
      restrictRelationsTo: z.array(z.string()).nullable(),
    }),
  });
  const component = z.object({
    uid: componentUid,
    category: z.string(),
    apiId: z.string(),
    schema: schema.extend({
      icon: z.string().optional(),
      connection: z.string().optional(),
    }),
  });
  const validationError = z
    .object({
      error: z.object({
        name: z.string(),
        message: z.string(),
        details: record.optional(),
      }),
    })
    .describe("The content-type kind query parameter is invalid.");
  const contracts: Record<string, BuiltInContract> = {
    "content-types.getContentTypes": {
      response: {
        200: z.object({ data: z.array(contentType) }),
        400: validationError,
      },
      request: { query: { kind: kind.optional() } },
    },
    "content-types.getContentType": {
      response: {
        200: z.object({ data: contentType }),
        404: z.object({ error: z.literal("contentType.notFound") }),
      },
      request: { params: { uid: modelUid } },
    },
    "components.getComponents": {
      response: z.object({ data: z.array(component) }),
    },
    "components.getComponent": {
      response: {
        200: z.object({ data: component }),
        404: z.object({ error: z.literal("component.notFound") }),
      },
      request: { params: { uid: componentUid } },
    },
  };
  return (_route, action) =>
    Object.hasOwn(contracts, action) ? contracts[action] : undefined;
}

function i18nContracts(z: Zod, schemas: Schemas): PluginTable {
  const locales = () => {
    const locale = modelResponse(
      schemas,
      "plugin::i18n.locale",
      [
        "id",
        "documentId",
        "name",
        "code",
        "createdAt",
        "updatedAt",
        "publishedAt",
      ],
      "GET /i18n/locales",
    );
    // listLocales adds isDefault from the plugin store. Locales seeded through
    // the query engine have no publishedAt.
    return z.array(
      locale.extend({
        isDefault: z.boolean(),
        publishedAt: locale.shape.publishedAt.nullable(),
      }),
    );
  };
  return (route, action) =>
    action === "locales.listLocales" && route.upstream.response === undefined
      ? { response: locales() }
      : undefined;
}

function emailContracts(z: Zod): PluginTable {
  const addresses = z.union([z.string(), z.array(z.string())]).optional();
  const body = z
    .looseObject({
      from: z.string().optional(),
      to: addresses,
      cc: addresses,
      bcc: addresses,
      replyTo: z.string().optional(),
      subject: z.string().optional(),
      text: z.string().optional(),
      html: z.string().optional(),
    })
    .describe("Provider-specific send options are passed through unchanged.");
  const response = z.strictObject({});
  return (route, action) =>
    action === "email.send" && route.upstream.response === undefined
      ? { response, request: { body: { "application/json": body } } }
      : undefined;
}
