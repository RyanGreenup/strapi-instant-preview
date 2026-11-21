import type { core, ZodObject, ZodType } from "zod/v4";

import type { Attribute, Model, Zod } from "../adapter";
import type { Populated, Presence, RequestPlan } from "./presence";

import { createBlocks, type BlocksProperties } from "./blocks";
import {
  conditionRules,
  publishedRequirements,
  visibility,
  visibleConstraints,
  visibleRequirements,
} from "./conditions";
import {
  asResponseField,
  withDefaultMeta,
  type SchemaRegistry,
} from "./modifiers";
import { markCoercesNumericString } from "./numeric-strings";
import { attributeType, scalar, type ScalarMode } from "./scalars";
import { fileJsonSchemas } from "./upload-file";

export interface Schemas {
  registry: SchemaRegistry;
  /** The status-independent document of any model, used by plugin contracts that narrow it. */
  document(uid: string): SchemaObject;
  /**
   * The document a content-API read returns. For `api::` types (unless
   * `publishedResponseRules` is off): a published or a draft document for a
   * draft-and-publish type, and a published document otherwise.
   */
  content(uid: string): ZodType;
  /** Per-status envelopes of a draft-and-publish `api::` type, or undefined. */
  statusResponses(
    uid: string,
    list: boolean,
  ): { published: SchemaObject; draft: SchemaObject } | undefined;
  /**
   * The write body without the `data` envelope. The default is a published create.
   * Updates permit omitted fields and leave conditional value rules relaxed
   * because they can depend on stored values.
   *
   * @remarks
   * Conditional rules in registry metadata apply in OpenAPI, not when Zod parses the input.
   */
  input(uid: string, update?: boolean, draft?: boolean): SchemaObject;
  /** The REST `data` and `meta` envelope. Lists accept page-based or offset-based pagination. */
  response(uid: string, list: boolean): ZodType;
  /**
   * The response of a default core action for one request. Keys follow the
   * request's `fields` and `populate`; values follow its `status`. Not
   * registered, so it never enters the emitted document.
   */
  queryResponse(uid: string, list: boolean, plan: RequestPlan): ZodType;
  error: ZodType;
  /** Uses the same details schema as `error` but requires the given HTTP status in the body. */
  errorFor(status: number): ZodType;
  readonly file: ZodType;
  count: ZodType;
  blocks: ZodType;
  warnings: string[];
}

interface SchemaModels {
  contentTypes: Record<string, Model>;
  components: Record<string, Model>;
  privateAttributes?: readonly string[];
}

// Response states. 'response' does not know the status (plugin models, polymorphic
// rows, or publishedResponseRules off). 'response-published' and 'response-draft'
// are the two versions of a draft-and-publish document; the status of the query
// also selects the version of every populated draft-and-publish relation. A type
// without draft and publish is always written with the published rules
// ('response-stable'), but a status=draft query still populates draft versions of
// its draft-and-publish relations, so those stay status-independent.
type ResponseMode =
  | "response"
  | "response-published"
  | "response-draft"
  | "response-stable";
type Mode =
  | ResponseMode
  | "create"
  | "update"
  | "draft-create"
  | "draft-update";
const isOutput = (mode: Mode): mode is ResponseMode =>
  mode.startsWith("response");
const publishedRules = (mode: Mode) =>
  mode === "response-published" || mode === "response-stable";
type Shape = Record<string, ZodType>;
export type SchemaObject = ZodObject<Shape, core.$ZodObjectConfig>;

export const fileUid = "plugin::upload.file";
const toMany: Record<string, true> = {
  oneToMany: true,
  manyToMany: true,
  manyWay: true,
  morphMany: true,
  morphToMany: true,
};
const systemInput: Record<string, true> = {
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  firstPublishedAt: true,
  locale: true,
};
const sharedNames = [
  "StrapiError",
  "StrapiFile",
  "StrapiCount",
  "StrapiBlocksNode",
  "StrapiBlocksListNode",
  "StrapiBlocksNodeInput",
  "StrapiBlocksListNodeInput",
  "StrapiFileFormat",
  "StrapiFileFocalPoint",
  "StrapiErrorDetails",
  "StrapiValidationErrorDetails",
  "StrapiKeyErrorDetails",
];
const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const relationalTypes = new Set([
  "relation",
  "media",
  "component",
  "dynamiczone",
]);

// Removes one `.optional()` or `.nullable()` wrapper, if present.
function unwrap(schema: ZodType, wrapper: "optional" | "nullable"): ZodType {
  const typed = schema as ZodType & {
    def: { type: string };
    unwrap?: () => ZodType;
  };
  return typed.def.type === wrapper && typed.unwrap ? typed.unwrap() : schema;
}

function pascalCase(value: string): string {
  return value.replace(/(?:^|[^a-z0-9]+)([a-z0-9]?)/gi, (_, initial: string) =>
    initial.toUpperCase(),
  );
}

/**
 * Creates a shared registry and schema cache for one model set.
 * As callers request model schemas, `warnings` collects build diagnostics.
 */
export function createSchemas(
  z: Zod,
  models: SchemaModels,
  config: {
    documentIdPattern: "cuid2" | "loose";
    strictResponseObjects?: boolean;
    publishedResponseRules?: boolean;
    // `api.documents.strictRelations`: Strapi checks `required` on relations and
    // media only when it is true, and never for drafts (entity-validator).
    strictRelations?: boolean;
    blocksProperties?: BlocksProperties;
  },
): Schemas {
  const registry: SchemaRegistry = z.registry();
  const warnings: string[] = [];
  const seenWarnings = new Set<string>();
  const names = new Set(sharedNames);
  const documents = new Map<string, SchemaObject>();
  const inputs = new Map<string, SchemaObject>();
  const entries = new Map<string, SchemaObject>();
  const responses = new Map<string, SchemaObject>();
  const stateDocuments = new Map<string, SchemaObject>();
  const contents = new Map<string, ZodType>();
  const stateDependent = new Map<string, boolean>();
  const splitStates = config.publishedResponseRules !== false;
  const responseObject = config.strictResponseObjects
    ? z.strictObject
    : z.looseObject;
  const privateAttributes = new Set(models.privateAttributes);

  const id = z.number().int();
  const rowId = id.positive();
  const documentId =
    config.documentIdPattern === "cuid2"
      ? z.string().regex(/^[a-z][a-z0-9]{23}$/)
      : z.string().min(1);
  const datetime = z.iso.datetime();
  const count = named(
    z.strictObject({ count: id.nonnegative() }),
    "StrapiCount",
  );
  const fileJson = fileJsonSchemas(z, registry);
  const blocks = createBlocks(
    z,
    registry,
    "response",
    fileJson,
    config.blocksProperties,
  );
  const blockArray = z.array(blocks);
  let blockInput: ZodType | undefined;
  // The stable 400 forms: a Yup validation error (formatYupErrors) and a
  // route's extra query or body key failing its schema. Other errors default to
  // {} (ApplicationError); http-errors leave details out. Open for the rest.
  const errorDetails = named(
    z.union([
      named(
        z.looseObject({
          errors: z.array(
            z.looseObject({
              path: z.array(z.string()),
              message: z.string(),
              name: z.string(),
              value: z.unknown().optional(),
            }),
          ),
        }),
        "StrapiValidationErrorDetails",
      ),
      named(
        z.looseObject({
          key: z.string(),
          path: z.string().nullable(),
          source: z.string(),
          param: z.string(),
        }),
        "StrapiKeyErrorDetails",
      ),
      z.looseObject({}),
    ]),
    "StrapiErrorDetails",
  );
  const error = named(
    z.looseObject({
      data: z.null(),
      error: z.looseObject({
        status: id,
        name: z.string(),
        message: z.string(),
        details: errorDetails.optional(),
      }),
    }),
    "StrapiError",
  );
  const errors = new Map<number, ZodType>();
  const morphEntries = new Map<string, SchemaObject>();
  const pagination = z.union([
    responseObject({
      page: id,
      pageSize: id,
      pageCount: id.optional(),
      total: id.optional(),
    }),
    responseObject({ start: id, limit: id, total: id.optional() }),
  ]);
  const listMeta = responseObject({ pagination });
  const singleMeta = responseObject({});
  const unboundedMorphTarget = z.looseObject({ __type: z.string() });
  const referenceId = z.union([rowId, z.string().min(1)]);
  const position = z.strictObject({
    before: referenceId.optional(),
    after: referenceId.optional(),
    start: z.boolean().optional(),
    end: z.boolean().optional(),
    __type: z.string().optional(),
  });
  const regularRelationInput = named(
    relationInput((morph) => relationInputItem(false, morph)),
    "StrapiWrite.RelationInput",
  );
  const morphRelationInput = named(
    relationInput((morph) => relationInputItem(true, morph)),
    "StrapiWrite.MorphRelationInput",
  );
  const mediaIds = z.array(rowId);

  function named<T extends ZodType>(
    schema: T,
    name: string,
    allOf?: Record<string, unknown>[],
    conditions?: Record<string, unknown>,
  ): T {
    registry.add(schema, {
      id: name,
      ...(allOf?.length && { allOf }),
      ...(conditions && { "x-strapi-conditions": conditions }),
    });
    return schema;
  }

  function nameFor(uid: string, model: Model, suffix: string): string {
    const localName = uid.slice(
      Math.max(uid.lastIndexOf(":"), uid.lastIndexOf(".")) + 1,
    );
    const base = pascalCase(model.info.singularName ?? localName) || "Model";
    let name = base + suffix;
    if (names.has(name)) {
      const qualified = pascalCase(uid) + suffix;
      name = qualified;
      for (let n = 2; names.has(name); n++) name = `${qualified}${n}`;
    }
    names.add(name);
    return name;
  }

  function warn(label: string, reason: string) {
    const message = `${label}: ${reason}`;
    if (!seenWarnings.has(message)) {
      warnings.push(message);
      seenWarnings.add(message);
    }
  }

  function errorFor(status: number): ZodType {
    let schema = errors.get(status);
    if (!schema) {
      const name = `StrapiError${status}`;
      names.add(name);
      schema = named(
        z.looseObject({
          data: z.null(),
          error: z.looseObject({
            status: z.literal(status),
            name: z.string(),
            message: z.string(),
            details: errorDetails.optional(),
          }),
        }),
        name,
      );
      errors.set(status, schema);
    }
    return schema;
  }

  function morphTargets(owner: string, key: string): string[] {
    const found = new Set<string>();
    for (const group of [models.contentTypes, models.components]) {
      for (const [uid, model] of Object.entries(group)) {
        for (const attribute of Object.values(model.attributes)) {
          const media =
            attribute.type === "media" &&
            owner === fileUid &&
            key === "related";
          const inverse =
            attribute.type === "relation" &&
            (attribute.relation === "morphOne" ||
              attribute.relation === "morphMany") &&
            attribute.target === owner &&
            attribute.morphBy === key;
          if (media || inverse) found.add(uid);
        }
      }
    }
    return [...found].sort();
  }

  function morphEntry(uid: string): SchemaObject {
    const existing = morphEntries.get(uid);
    if (existing) return existing;
    const isComponent = !hasOwn(models.contentTypes, uid);
    const model = isComponent
      ? models.components[uid]
      : models.contentTypes[uid];
    const shape = fields(uid, model, "response", isComponent);
    shape.id = rowId;
    if (!isComponent) {
      shape.documentId = documentId.optional();
      if (hasOwn(model.attributes, "locale") && !hasOwn(shape, "locale"))
        shape.locale = z.string().nullable().optional();
    }
    shape.__type = z.literal(uid);
    const result = named(
      responseObject(shape),
      nameFor(uid, model, "MorphEntry"),
    );
    morphEntries.set(uid, result);
    return result;
  }

  function morphTarget(owner: string, key: string): ZodType {
    const uids = morphTargets(owner, key);
    if (!uids.length) return unboundedMorphTarget;
    return z.lazy(() => {
      const variants = uids.map(morphEntry);
      return variants.length === 1
        ? variants[0]
        : z.discriminatedUnion(
            "__type",
            variants as [SchemaObject, ...SchemaObject[]],
          );
    });
  }

  function unknown(label: string, reason: string): ZodType {
    warn(label, reason);
    return z.unknown();
  }

  /**
   * Polymorphic longhand requires `__type`.
   * Shorthand IDs use the same form for regular and polymorphic relations.
   */
  function relationInputItem(morph: boolean, positioned: boolean): ZodType {
    const common = {
      ...(positioned && { position: position.optional() }),
      ...(morph && { __type: z.string().min(1) }),
    };
    const longhand = z.union([
      z.strictObject({
        ...common,
        id: z.union([rowId, z.string().regex(/^0*[1-9]\d*$/)]),
      }),
      z.strictObject({
        ...common,
        documentId: z.string().min(1),
        locale: z.string().optional(),
        ...(positioned && {
          status: z.enum(["draft", "published"]).optional(),
        }),
      }),
    ]);
    return z.union([referenceId, longhand]);
  }

  /**
   * Operation objects accept only `connect`, `disconnect`, and `set` keys.
   * Only `connect` and `set` accept `position` or `status` on a reference.
   * Only a `documentId` reference accepts `status`.
   */
  function relationInput(item: (positioned: boolean) => ZodType): ZodType {
    const list = (positioned: boolean) =>
      z.union([item(positioned), z.array(item(positioned))]);
    const plain = list(false);
    const positioned = list(true).nullable().optional();
    return z.union([
      plain,
      z.strictObject({
        connect: positioned,
        disconnect: plain.nullable().optional(),
        set: positioned,
      }),
    ]);
  }

  /** An optional repeatable field accepts an empty array even if its minimum is positive. */
  function arrayInput(
    item: ZodType,
    attribute: Attribute,
    draft: boolean,
  ): ZodType {
    const min = attribute.min;
    const max = attribute.max;
    let array = z.array(item);
    if (draft) return array;
    if (typeof max === "number" && Number.isInteger(max))
      array = array.max(max);
    if (typeof min !== "number" || !Number.isInteger(min) || min <= 0)
      return array;
    array = array.min(min);
    return attribute.required === true
      ? array
      : z.union([z.array(z.never()), array]);
  }

  // Whether Strapi checks `required` on the field: not on relations and media
  // unless strictRelations is on.
  function requiredIsChecked(attribute: Attribute | undefined) {
    if (!attribute) return false;
    const type = attributeType(attribute);
    return (
      config.strictRelations === true ||
      (type !== "relation" && type !== "media")
    );
  }

  // The value rules of a conditional scalar while it is visible, as JSON Schema,
  // or undefined when visibility changes nothing for it.
  function visibleRules(
    attribute: Attribute | undefined,
    draft: boolean,
  ): Record<string, unknown> | undefined {
    if (!attribute) return undefined;
    const type = attributeType(attribute);
    if (relationalTypes.has(type) || type === "blocks" || type === "json")
      return undefined;
    let unsupported = false;
    const ruled = scalar(z, attribute, draft ? "draft" : "published", () => {
      unsupported = true;
      return z.unknown();
    });
    if (unsupported) return undefined;
    const toJson = (schema: ZodType) => {
      const { $schema: _, ...json } = z.toJSONSchema(schema, {
        target: "draft-2020-12",
        io: "input",
        unrepresentable: "any",
      }) as Record<string, unknown>;
      return json;
    };
    const json = toJson(ruled);
    if (
      JSON.stringify(json) ===
      JSON.stringify(
        toJson(scalar(z, attribute, "unchecked-input", () => z.unknown())),
      )
    )
      return undefined;
    return { anyOf: [json, { type: "null" }] };
  }

  function requirements(uid: string, model: Model, shape: Shape, mode: Mode) {
    if (mode === "create" || mode === "draft-create") {
      const keys = Object.keys(shape);
      const required =
        mode === "create"
          ? publishedRequirements(
              model,
              keys,
              (key) =>
                warn(
                  `${uid}.${key}`,
                  "cannot represent loose visibility condition",
                ),
              (key) => requiredIsChecked(model.attributes[key]),
            )
          : [];
      return [
        ...required,
        ...visibleConstraints(model, keys, (key) =>
          visibleRules(model.attributes[key], mode === "draft-create"),
        ),
      ];
    }
    // A visible required field of a published document is non-null when present.
    return publishedRules(mode)
      ? visibleRequirements(model, Object.keys(shape), "response")
      : undefined;
  }

  function component(uid: string, mode: Mode, zone: boolean): SchemaObject {
    const key = `${uid}:${mode}:${zone}`;
    const existing = entries.get(key);
    if (existing) return existing;
    const model = models.components[uid];
    // A stable owner only differs from a published one through the relations it populates.
    if (mode === "response-stable" && !hasStateDependentRelations(uid))
      return component(uid, "response-published", zone);
    const shape = fields(uid, model, mode, true);
    shape.id = isOutput(mode) ? rowId : rowId.optional();
    if (zone) shape.__component = z.literal(uid);
    const suffix = isOutput(mode)
      ? `${{ response: "", "response-published": "Published", "response-draft": "Draft", "response-stable": "Stable" }[mode]}Entry`
      : `${mode.startsWith("draft") ? "Draft" : ""}${mode.endsWith("update") ? "Update" : ""}Input`;
    const result = named(
      isOutput(mode) ? responseObject(shape) : z.strictObject(shape),
      nameFor(uid, model, zone ? `Zone${suffix}` : suffix),
      requirements(uid, model, shape, mode),
      conditionRules(model, Object.keys(shape)),
    );
    entries.set(key, result);
    return result;
  }

  function dynamicZone(
    attribute: Attribute,
    mode: Mode,
    label: string,
    enforce: boolean,
  ): ZodType {
    const raw = attribute.components;
    if (!Array.isArray(raw))
      return unknown(label, "invalid dynamic zone components");
    const uids = new Set<string>();
    for (const uid of raw) {
      if (typeof uid !== "string" || !hasOwn(models.components, uid)) {
        warn(label, `unknown dynamic zone component ${JSON.stringify(uid)}`);
      } else {
        uids.add(uid);
      }
    }
    return z.lazy(() => {
      const variants = Array.from(uids, (uid) => component(uid, mode, true));
      const entry =
        variants.length > 0
          ? z.discriminatedUnion(
              "__component",
              variants as [SchemaObject, ...SchemaObject[]],
            )
          : z.never();
      // A hidden zone skips its entry count rules.
      if (!isOutput(mode))
        return arrayInput(
          entry,
          attribute,
          mode.startsWith("draft") || visibility(attribute) !== undefined,
        );
      // No `count` branch: Strapi ignores `populate[zone][count]=true` and
      // sends the entries (see presence.ts).
      return publishedRules(mode) && enforce
        ? arrayInput(entry, attribute, false)
        : z.array(entry);
    });
  }

  function baseAttribute(
    attribute: Attribute,
    mode: Mode,
    owner: string,
    key: string,
    writeConstraints: boolean,
  ): ZodType {
    const label = `${owner}.${key}`;
    const type = attributeType(attribute);
    const output = isOutput(mode);
    switch (type) {
      case "blocks":
        return output
          ? blockArray
          : (blockInput ??= z.array(
              createBlocks(
                z,
                registry,
                "input",
                fileJson,
                config.blocksProperties,
              ),
            ));
      case "media": {
        if (!output) return attribute.multiple === true ? mediaIds : rowId;
        if (!hasOwn(models.contentTypes, fileUid))
          return unknown(label, `unknown media target ${fileUid}`);
        const file = z.lazy(() => document(fileUid));
        return attribute.multiple === true ? z.array(file) : file;
      }
      case "component": {
        const uid = attribute.component;
        if (typeof uid !== "string" || !hasOwn(models.components, uid)) {
          return unknown(label, `unknown component ${JSON.stringify(uid)}`);
        }
        const entry = z.lazy(() => component(uid, mode, false));
        if (!output) {
          // A hidden repeatable component skips its entry count rules.
          return attribute.repeatable === true
            ? arrayInput(
                entry,
                attribute,
                mode.startsWith("draft") || visibility(attribute) !== undefined,
              )
            : entry;
        }
        const list =
          publishedRules(mode) && writeConstraints
            ? arrayInput(entry, attribute, false)
            : z.array(entry);
        return z.union([attribute.repeatable === true ? list : entry, count]);
      }
      case "dynamiczone":
        return dynamicZone(attribute, mode, label, writeConstraints);
      case "relation": {
        const relation = attribute.relation;
        if (typeof relation !== "string")
          return unknown(label, "invalid relation kind");
        const multiple = hasOwn(toMany, relation);
        const polymorphic =
          relation === "morphToOne" || relation === "morphToMany";
        if (!output)
          return polymorphic ? morphRelationInput : regularRelationInput;
        const uid = attribute.target;
        if (
          !polymorphic &&
          (typeof uid !== "string" || !hasOwn(models.contentTypes, uid))
        ) {
          return unknown(
            label,
            `unknown relation target ${JSON.stringify(uid)}`,
          );
        }
        const target = polymorphic
          ? morphTarget(owner, key)
          : z.lazy(() => relationTarget(uid as string, mode));
        return z.union([multiple ? z.array(target) : target, count]);
      }
      default: {
        if (owner === fileUid && type === "json" && hasOwn(fileJson, key))
          return fileJson[key as keyof typeof fileJson];
        // A field that its condition can hide keeps only its type: Strapi skips its
        // rules while hidden. On create, visibleConstraints restores them while visible.
        const scalarMode: ScalarMode =
          visibility(attribute) !== undefined
            ? output
              ? "unchecked-response"
              : "unchecked-input"
            : output
              ? writeConstraints
                ? publishedRules(mode)
                  ? "published-response"
                  : "validated-response"
                : "response"
              : mode.startsWith("draft")
                ? "draft"
                : "published";
        const schema = scalar(
          z,
          attribute,
          scalarMode,
          (reason) => unknown(label, reason),
          registry,
        );
        return output
          ? schema
          : markCoercesNumericString(registry, type, schema);
      }
    }
  }

  function fields(
    uid: string,
    model: Model,
    mode: Mode,
    isComponent = false,
  ): Shape {
    const output = isOutput(mode);
    const writeConstraints = isComponent || uid.startsWith("api::");
    const shape: Shape = Object.create(null);
    const localPrivate = new Set(model.options?.privateAttributes);
    const isPrivate = (name: string, attribute?: Attribute) =>
      attribute?.private === true ||
      localPrivate.has(name) ||
      privateAttributes.has(name);
    for (const [key, attribute] of Object.entries(model.attributes)) {
      if (
        key === "id" ||
        key === "documentId" ||
        (isComponent && key === "__component")
      )
        continue;
      const type = attributeType(attribute);
      if (isPrivate(key, attribute)) continue;
      if (output) {
        if (type === "password") continue;
        if (
          !isComponent &&
          key === "locale" &&
          model.pluginOptions?.i18n?.localized !== true
        )
          continue;
      } else if (
        attribute.writable === false ||
        (!isComponent && hasOwn(systemInput, key))
      ) {
        continue;
      }
      const schema = baseAttribute(
        attribute,
        mode,
        uid,
        key,
        writeConstraints && !visibility(attribute),
      );
      if (output) {
        /**
         * Indicates of nonNull is provided by nature of the way something was uploaded.
         *
         * Required values are enforced on published writes specifically, not for hidden (conditional) fields or relations and media (`strictRelations` is off by default).
         *
         * The upload service writes file rows through the query engine, so the entity validator never checks them.
         *
         * Every write path still sets each required file scalar (`formatFileInfo`, `uploadFileAndPersist`, `updateFileInfo`), so they are non-null unless `publishedResponseRules` is off.
         */
        const setByUpload =
          splitStates && uid === fileUid && attribute.required === true;
        const nonNull =
          (setByUpload ||
            (publishedRules(mode) &&
              writeConstraints &&
              !visibility(attribute) &&
              attribute.required === true)) &&
          type !== "relation" &&
          type !== "media";
        if (!isComponent && key === "publishedAt") {
          shape[key] = publishedAt(model, mode);
        } else if (
          !isComponent &&
          (key === "createdAt" || key === "updatedAt")
        ) {
          shape[key] = datetime.optional();
        } else if (!isComponent && key === "locale") {
          shape[key] = z.string().optional();
        } else {
          shape[key] =
            (type === "media" && attribute.multiple === true) || nonNull
              ? schema.optional()
              : asResponseField(schema);
        }
      } else {
        const required =
          !mode.startsWith("draft") &&
          attribute.required === true &&
          !visibility(attribute) &&
          requiredIsChecked(attribute);
        const list =
          type === "dynamiczone" ||
          (type === "component" && attribute.repeatable === true);
        const input =
          (required && type !== "media") || list ? schema : schema.nullable();
        const value = attribute.default;
        if (mode.endsWith("create") && value !== undefined) {
          shape[key] =
            typeof value === "function" || typeof value === "symbol"
              ? input.optional()
              : withDefaultMeta(
                  registry,
                  input,
                  typeof value === "bigint" ? value.toString() : value,
                );
        } else {
          shape[key] = required && mode === "create" ? input : input.optional();
        }
      }
    }
    if (output && !isComponent) {
      for (const name of ["createdAt", "updatedAt"]) {
        if (!hasOwn(model.attributes, name) && !isPrivate(name))
          shape[name] = datetime.optional();
      }
      if (
        !hasOwn(model.attributes, "publishedAt") &&
        !isPrivate("publishedAt")
      ) {
        shape.publishedAt = publishedAt(model, mode);
      }
      if (
        model.pluginOptions?.i18n?.localized === true &&
        !hasOwn(model.attributes, "locale") &&
        !isPrivate("locale")
      ) {
        shape.locale = z.string().optional();
      }
    }
    return shape;
  }

  function publishedAt(model: Model, mode: ResponseMode): ZodType {
    if (!model.options?.draftAndPublish) return datetime.optional();
    if (mode === "response-draft") return z.null().optional();
    return mode === "response"
      ? asResponseField(datetime)
      : datetime.optional();
  }

  const isApi = (uid: string) => uid.startsWith("api::");
  const hasDraftAndPublish = (uid: string) =>
    models.contentTypes[uid]?.options?.draftAndPublish === true;

  // Whether a component reaches a draft-and-publish relation, directly or through nested components.
  function hasStateDependentRelations(
    uid: string,
    seen = new Set<string>(),
  ): boolean {
    const known = stateDependent.get(uid);
    if (known !== undefined) return known;
    if (seen.has(uid)) return false;
    seen.add(uid);
    let found = false;
    for (const attribute of Object.values(
      models.components[uid]?.attributes ?? {},
    )) {
      if (
        attribute.type === "relation" &&
        typeof attribute.target === "string" &&
        hasDraftAndPublish(attribute.target)
      )
        found = true;
      const nested =
        attribute.type === "component"
          ? [attribute.component]
          : attribute.type === "dynamiczone" &&
              Array.isArray(attribute.components)
            ? attribute.components
            : [];
      if (
        nested.some(
          (child) =>
            typeof child === "string" &&
            hasStateDependentRelations(child, seen),
        )
      )
        found = true;
      if (found) break;
    }
    stateDependent.set(uid, found);
    return found;
  }

  // The document populated through a relation, given the state of its owner.
  function relationTarget(uid: string, mode: Mode): ZodType {
    if (!splitStates || !isApi(uid)) return document(uid);
    if (!hasDraftAndPublish(uid)) return stateDocument(uid, "response-stable");
    if (mode === "response-published")
      return stateDocument(uid, "response-published");
    if (mode === "response-draft") return stateDocument(uid, "response-draft");
    return content(uid);
  }

  function stateDocument(
    uid: string,
    mode: "response-published" | "response-draft" | "response-stable",
  ): SchemaObject {
    const key = `${uid}:${mode}`;
    const existing = stateDocuments.get(key);
    if (existing) return existing;
    const model = contentType(uid);
    const shape = fields(uid, model, mode);
    shape.id = rowId;
    shape.documentId = documentId;
    const suffix =
      mode === "response-published"
        ? "PublishedDocument"
        : mode === "response-draft"
          ? "DraftDocument"
          : "Document";
    const result = named(
      responseObject(shape),
      nameFor(uid, model, suffix),
      requirements(uid, model, shape, mode),
      conditionRules(model, Object.keys(shape)),
    );
    stateDocuments.set(key, result);
    return result;
  }

  function content(uid: string): ZodType {
    if (!splitStates || !isApi(uid)) return document(uid);
    if (!hasDraftAndPublish(uid)) return stateDocument(uid, "response-stable");
    const existing = contents.get(uid);
    if (existing) return existing;
    // anyOf, not oneOf: when `fields` leaves out publishedAt, a body can match both branches.
    const result = named(
      z.union([
        stateDocument(uid, "response-published"),
        stateDocument(uid, "response-draft"),
      ]),
      nameFor(uid, contentType(uid), "Document"),
    );
    contents.set(uid, result);
    return result;
  }

  function envelope(data: ZodType, list: boolean) {
    return list
      ? responseObject({ data: z.array(data), meta: listMeta })
      : responseObject({ data, meta: singleMeta });
  }

  function statusResponses(uid: string, list: boolean) {
    if (!splitStates || !isApi(uid) || !hasDraftAndPublish(uid))
      return undefined;
    const key = `${uid}:${list}:status`;
    const model = contentType(uid);
    const build = (
      mode: "response-published" | "response-draft",
      label: string,
    ) => {
      const cacheKey = `${key}:${mode}`;
      const existing = responses.get(cacheKey);
      if (existing) return existing;
      const result = named(
        envelope(stateDocument(uid, mode), list),
        nameFor(uid, model, `${label}${list ? "ListResponse" : "Response"}`),
      );
      responses.set(cacheKey, result);
      return result;
    };
    return {
      published: build("response-published", "Published"),
      draft: build("response-draft", "Draft"),
    };
  }

  function contentType(uid: string): Model {
    if (!hasOwn(models.contentTypes, uid))
      throw new Error(`Unknown Strapi content type ${uid}`);
    return models.contentTypes[uid];
  }

  function document(uid: string): SchemaObject {
    const existing = documents.get(uid);
    if (existing) return existing;
    const model = contentType(uid);
    const shape = fields(uid, model, "response");
    shape.id = rowId;
    shape.documentId = documentId;
    if (uid === fileUid && !hasOwn(shape, "isUrlSigned"))
      shape.isUrlSigned = z.boolean().optional();
    const result = named(
      responseObject(shape),
      uid === fileUid ? "StrapiFile" : nameFor(uid, model, "Document"),
    );
    documents.set(uid, result);
    return result;
  }

  function input(uid: string, update = false, draft = false): SchemaObject {
    const mode: Mode = draft
      ? update
        ? "draft-update"
        : "draft-create"
      : update
        ? "update"
        : "create";
    const key = `${uid}:${mode}`;
    const existing = inputs.get(key);
    if (existing) return existing;
    const model = contentType(uid);
    const shape = fields(uid, model, mode);
    const result = named(
      z.strictObject(shape),
      nameFor(
        uid,
        model,
        `${draft ? "Draft" : ""}${update ? "Update" : ""}Input`,
      ),
      requirements(uid, model, shape, mode),
      conditionRules(model, Object.keys(shape)),
    );
    inputs.set(key, result);
    return result;
  }

  function response(uid: string, list: boolean): SchemaObject {
    const key = `${uid}:${list}`;
    const existing = responses.get(key);
    if (existing) return existing;
    const result = named(
      envelope(content(uid), list),
      nameFor(uid, contentType(uid), list ? "ListResponse" : "Response"),
    );
    responses.set(key, result);
    return result;
  }

  // Keys present for one request (see presence.ts). Starts from the static
  // response shape, so value rules stay the same, then:
  // - drops relational keys that are not populated and rebuilds populated ones;
  // - makes sent scalars required keys;
  // - on a published read, makes publishedAt and required scalars non-null.
  //   Required scalars only on Document Service models (as writeConstraints)
  //   and only without conditions.visible: Strapi skips `required` for hidden
  //   fields and for drafts.
  function presentShape(
    uid: string,
    model: Model,
    isComponent: boolean,
    plan: Presence,
    status: RequestPlan["status"],
  ): Shape {
    const shape = fields(uid, model, "response", isComponent);
    const documentService = isComponent || uid.startsWith("api::");
    // Components take the owning document's effective status (populatedValue).
    const published =
      status === "published" ||
      (!isComponent && model.options?.draftAndPublish !== true);
    for (const key of Object.keys(shape)) {
      const attribute = hasOwn(model.attributes, key)
        ? model.attributes[key]
        : undefined;
      if (attribute && relationalTypes.has(attributeType(attribute))) {
        const populated = plan.populate.get(key);
        if (populated)
          shape[key] = populatedValue(
            uid,
            key,
            attribute,
            populated,
            status,
            published ? "published" : "draft",
          );
        else delete shape[key];
        continue;
      }
      if (plan.fields && !plan.fields.has(key)) continue;
      let schema = unwrap(shape[key], "optional");
      const nonNull =
        published &&
        ((!isComponent && key === "publishedAt") ||
          (documentService &&
            attribute?.required === true &&
            !visibility(attribute)));
      if (nonNull) schema = unwrap(schema, "nullable");
      shape[key] = schema;
    }
    return shape;
  }

  // `status` is the requested one, for related documents; `own` is the owner's
  // effective status, which its components share.
  function populatedValue(
    owner: string,
    key: string,
    attribute: Attribute,
    populated: Populated,
    status: RequestPlan["status"],
    own: RequestPlan["status"],
  ): ZodType {
    if (populated.kind === "count") return count;
    const type = attributeType(attribute);
    let item: ZodType;
    let multiple: boolean;
    if (populated.kind === "zone") {
      const variants = Array.from(populated.on, ([uid, plan]) =>
        presentComponent(uid, plan, own, true),
      );
      item =
        variants.length > 0
          ? z.discriminatedUnion(
              "__component",
              variants as [SchemaObject, ...SchemaObject[]],
            )
          : z.never();
      multiple = true;
    } else if (type === "media") {
      item = presentDocument(fileUid, populated.plan, status);
      multiple = attribute.multiple === true;
      // A multiple media field is never null (see fields()).
      if (multiple) return z.array(item);
    } else if (type === "component") {
      item = presentComponent(
        attribute.component as string,
        populated.plan,
        own,
        false,
      );
      multiple = attribute.repeatable === true;
    } else {
      const relation = attribute.relation as string;
      const polymorphic =
        relation === "morphToOne" || relation === "morphToMany";
      item = polymorphic
        ? morphTarget(owner, key)
        : presentDocument(attribute.target as string, populated.plan, status);
      multiple = hasOwn(toMany, relation);
    }
    return (multiple ? z.array(item) : item).nullable();
  }

  function presentDocument(
    uid: string,
    plan: Presence,
    status: RequestPlan["status"],
  ): SchemaObject {
    const model = contentType(uid);
    const shape = presentShape(uid, model, false, plan, status);
    shape.id = rowId;
    shape.documentId = documentId;
    if (uid === fileUid && !hasOwn(shape, "isUrlSigned"))
      shape.isUrlSigned = z.boolean().optional();
    return responseObject(shape);
  }

  function presentComponent(
    uid: string,
    plan: Presence,
    status: RequestPlan["status"],
    zone: boolean,
  ): SchemaObject {
    const shape = presentShape(uid, models.components[uid], true, plan, status);
    shape.id = rowId;
    if (zone) shape.__component = z.literal(uid);
    return responseObject(shape);
  }

  function queryResponse(
    uid: string,
    list: boolean,
    plan: RequestPlan,
  ): SchemaObject {
    const data = presentDocument(uid, plan.root, plan.status);
    if (!list) return responseObject({ data, meta: singleMeta });
    const { style, withCount } = plan.pagination;
    const counted = withCount
      ? style === "page"
        ? { pageCount: id, total: id }
        : { total: id }
      : {};
    const position =
      style === "page" ? { page: id, pageSize: id } : { start: id, limit: id };
    return responseObject({
      data: z.array(data),
      meta: responseObject({
        pagination: responseObject({ ...position, ...counted }),
      }),
    });
  }

  return {
    registry,
    document,
    content,
    statusResponses,
    input,
    response,
    queryResponse,
    error,
    errorFor,
    get file() {
      return document(fileUid);
    },
    count,
    blocks,
    warnings,
  };
}
