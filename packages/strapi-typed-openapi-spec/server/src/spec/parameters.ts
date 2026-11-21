import type { ZodType } from "zod/v4";

import type { ModelFields } from "./model-fields";
import type { JSONSchema } from "./schemas";

import { pathPattern } from "./paging";
import { resolveLocalPointer } from "./pointer";
import { schemaRef } from "./schemas";

type QueryParameter = {
  name: string;
  in: "query";
  required: boolean;
  schema: JSONSchema;
  style?: "deepObject";
  explode?: boolean;
};
type QueryModel = {
  schema?: ZodType;
  uid: string;
  fields: ModelFields;
  filters?: (uid: string) => JSONSchema;
  sort?: (uid: string) => JSONSchema;
  exactUpstream?: boolean;
  /** `owner.key` of relations that never answer `count` (join-column storage). */
  countless?: readonly string[];
};

function isSchema(value: unknown): value is JSONSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Returns `undefined` for an indeterminate object shape, such as an unresolved `$ref` with no local type constraint. */
function objectShape(
  schema: unknown,
  document: unknown,
  ancestors: Set<JSONSchema>,
): boolean | undefined {
  if (schema === false) return false;
  if (!isSchema(schema) || ancestors.has(schema)) return;
  const { type, $ref, allOf, anyOf, oneOf } = schema;
  const objectType =
    type === "object" || (Array.isArray(type) && type.includes("object"));
  if (type !== undefined && !objectType) return false;
  let result: boolean | undefined = objectType ? true : undefined;
  ancestors.add(schema);
  try {
    if (typeof $ref === "string") {
      const shape = objectShape(
        resolveLocalPointer(document, $ref),
        document,
        ancestors,
      );
      if (shape === false) return false;
      result ??= shape;
    }
    if (Array.isArray(allOf)) {
      for (const constraint of allOf) {
        const shape = objectShape(constraint, document, ancestors);
        if (shape === false) return false;
        result ??= shape;
      }
    }
    for (const alternatives of [anyOf, oneOf]) {
      if (!Array.isArray(alternatives)) continue;
      let allowed = false;
      for (const branch of alternatives) {
        const shape = objectShape(branch, document, ancestors);
        if (shape === false) continue;
        allowed = true;
        if (shape === true) {
          result = true;
          break;
        }
      }
      if (!allowed) return false;
    }
    return result;
  } finally {
    ancestors.delete(schema);
  }
}

function commaList(field: string): JSONSchema {
  return {
    type: "string",
    pattern: `^\\s*${field}(?:\\s*,\\s*${field})*\\s*$`,
  };
}

function commaSeparated(keys: string[]): JSONSchema {
  return commaList(
    `(?:${[...new Set(keys)].map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  );
}

function fieldsWithShorthand(
  schema: JSONSchema,
  identifiers = ["id", "documentId"],
): JSONSchema {
  const { items, description, ...array } = schema;
  if (
    array.type !== "array" ||
    !isSchema(items) ||
    items.type !== "string" ||
    !Array.isArray(items.enum) ||
    !items.enum.every((key): key is string => typeof key === "string")
  )
    return schema;

  const names = [...new Set([...items.enum, ...identifiers])];
  return {
    ...(typeof description === "string" && { description }),
    anyOf: [
      { ...array, items: { type: "string", enum: names } },
      commaSeparated(names),
      { type: "string", const: "*" },
    ],
  };
}

const populatable: Record<string, true> = {
  relation: true,
  component: true,
  dynamiczone: true,
  media: true,
};
const booleanLike = {
  anyOf: [
    { type: "boolean" },
    { type: "string", enum: ["true", "false", "t", "f", "1", "0"] },
  ],
};
const wildcard = { type: "string", const: "*" };
const closedObject = (properties: Record<string, JSONSchema>): JSONSchema => ({
  type: "object",
  properties,
  additionalProperties: false,
});

function modelQuery(
  source: QueryModel,
  components: Record<string, JSONSchema>,
) {
  const catalog = source.fields;

  function namedObject(
    uid: string,
    kind: "Object" | "Options",
    build: () => Record<string, JSONSchema>,
  ): JSONSchema {
    const name = `StrapiPopulate${kind}.${uid.replace(/[^a-z\d_.]/gi, (char) => `-${char.charCodeAt(0).toString(16)}-`)}`;
    if (!Object.hasOwn(components, name)) {
      const properties: Record<string, JSONSchema> = Object.create(null);
      components[name] = closedObject(properties);
      Object.assign(properties, build());
    }
    return { $ref: schemaRef(name) };
  }

  function fields(uid: string): JSONSchema {
    const { isContentType, attributes } = catalog.get(uid);
    const identifiers = isContentType ? ["id", "documentId"] : ["id"];
    const names = new Set(identifiers);
    for (const { name, attribute, private: hidden } of attributes) {
      if (
        !hidden &&
        attribute.type !== "password" &&
        !Object.hasOwn(populatable, attribute.type)
      )
        names.add(name);
    }
    return fieldsWithShorthand(
      { type: "array", items: { type: "string", enum: [...names] } },
      identifiers,
    );
  }

  function dottedPopulate(uid: string, nested = false): JSONSchema[] {
    const graph = (modelUid: string) => {
      const names = new Set<string>();
      const nested = new Map<string, string>();
      for (const {
        name,
        attribute,
        private: hidden,
        target,
        polymorphic,
      } of catalog.get(modelUid).attributes) {
        if (hidden || !Object.hasOwn(populatable, attribute.type)) continue;
        names.add(name);
        if (
          target !== undefined &&
          (attribute.type === "component" ||
            (attribute.type === "relation" && !polymorphic))
        ) {
          nested.set(name, target);
        }
      }
      return { names, nested };
    };
    if (!graph(uid).names.size) return [];
    const path = nested
      ? { type: "string", pattern: `^(?:${pathPattern(uid, graph)})$` }
      : commaList(`(?:${pathPattern(uid, graph)})`);
    return [path, { type: "array", items: path }];
  }

  function options(uid: string): JSONSchema {
    return namedObject(uid, "Options", () => ({
      fields: fields(uid),
      populate: {
        anyOf: [wildcard, ...dottedPopulate(uid, true), populateObject(uid)],
      },
      filters: source.filters?.(uid) ?? { type: "object" },
      sort: source.sort?.(uid) ?? { type: ["string", "array", "object"] },
      count: booleanLike,
    }));
  }

  function populateObject(uid: string): JSONSchema {
    return namedObject(uid, "Object", () => {
      const properties: Record<string, JSONSchema> = Object.create(null);
      for (const {
        name,
        attribute,
        private: hidden,
        target,
        polymorphic,
      } of catalog.get(uid).attributes) {
        if (hidden || !Object.hasOwn(populatable, attribute.type)) continue;
        if (
          attribute.type === "dynamiczone" ||
          (attribute.type === "relation" && polymorphic)
        ) {
          const targets =
            attribute.type === "dynamiczone"
              ? Array.isArray(attribute.components)
                ? attribute.components
                : []
              : typeof attribute.target === "string"
                ? [attribute.target]
                : catalog.contentTypeUids;
          const on: Record<string, JSONSchema> = Object.create(null);
          for (const item of targets) {
            if (typeof item === "string" && catalog.get(item).model)
              on[item] = { anyOf: [booleanLike, options(item)] };
          }
          properties[name] = {
            anyOf: [
              booleanLike,
              closedObject({
                populate: wildcard,
                on: closedObject(on),
                count: booleanLike,
              }),
            ],
          };
        } else {
          properties[name] =
            target !== undefined
              ? { anyOf: [booleanLike, options(target)] }
              : booleanLike;
        }
      }
      return properties;
    });
  }

  return {
    exists: !!catalog.get(source.uid).model,
    fields: (schema: JSONSchema): JSONSchema => {
      const derived = fields(source.uid);
      return typeof schema.description === "string"
        ? { ...derived, description: schema.description }
        : derived;
    },
    populate: (schema: JSONSchema): JSONSchema => ({
      description: [
        "Use Strapi bracket syntax for nested population, e.g. populate[category][fields][0]=name.",
        "Populating a relation requests it but does not grant permission to read it: Strapi omits the key when the caller lacks `find` permission on the relation's target.",
        ...(source.countless?.length
          ? [
              `\`count\` returns { count } only for relations stored in a join table. For ${source.countless.join(", ")} Strapi ignores \`count\` and returns the related document or null.`,
            ]
          : []),
      ].join(" "),
      anyOf: [
        source.exactUpstream ? schema : wildcard,
        ...dottedPopulate(source.uid),
        populateObject(source.uid),
      ],
    }),
  };
}

/**
 * Uses schema identity to preserve overrides to `fields` and `populate`.
 * If a parameter uses its baseline schema, conversion can add Strapi shorthand and model-specific constraints.
 * Object branches use `deepObject`, but objects inside array items do not.
 */
export function buildQueryParameters(
  query: Record<string, ZodType> | undefined,
  convertInput: (schema: ZodType, origin: string) => JSONSchema,
  components: Record<string, JSONSchema>,
  upstreamFields?: ZodType,
  queryModel?: QueryModel,
): QueryParameter[] {
  const model = queryModel && modelQuery(queryModel, components);
  const document = { components: { schemas: components } };
  return Object.entries(query ?? {}).map(([name, param]) => {
    const input = convertInput(param, `query parameter ${name}`);
    const schema =
      name === "fields" && param === upstreamFields
        ? model?.exists
          ? model.fields(input)
          : fieldsWithShorthand(input)
        : name === "populate" && model?.exists && param === queryModel?.schema
          ? model.populate(input)
          : input;
    return {
      name,
      in: "query",
      required: !param.isOptional(),
      schema,
      ...(objectShape(schema, document, new Set()) && {
        style: "deepObject",
        explode: true,
      }),
    };
  });
}
