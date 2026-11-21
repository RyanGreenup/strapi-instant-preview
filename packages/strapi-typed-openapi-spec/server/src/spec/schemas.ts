import type { ZodType } from "zod/v4";

import { createHash } from "node:crypto";

import type { Zod } from "../adapter";
import type { SchemaRegistry } from "../schemas/modifiers";

import { parseLocalPointer, pointerToken } from "./pointer";

export type JSONSchema = Record<string, unknown>;
export const schemaRef = (name: string) =>
  `#/components/schemas/${pointerToken(name)}`;

type Visitor = (schema: JSONSchema) => void;
const schemaChildren: Record<string, "map" | "list" | "schema"> = {
  properties: "map",
  patternProperties: "map",
  dependentSchemas: "map",
  $defs: "map",
  definitions: "map",
  allOf: "list",
  anyOf: "list",
  oneOf: "list",
  prefixItems: "list",
  additionalProperties: "schema",
  unevaluatedProperties: "schema",
  propertyNames: "schema",
  items: "schema",
  contains: "schema",
  unevaluatedItems: "schema",
  not: "schema",
  if: "schema",
  then: "schema",
  else: "schema",
  contentSchema: "schema",
};
const operationMethods: Record<string, true> = {
  get: true,
  put: true,
  post: true,
  delete: true,
  options: true,
  head: true,
  patch: true,
  trace: true,
};
export const isOperationMethod = (method: string) =>
  Object.hasOwn(operationMethods, method);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function visitSchema(schema: unknown, visit: Visitor) {
  if (!record(schema)) return;
  visit(schema);
  for (const [key, value] of Object.entries(schema)) {
    switch (schemaChildren[key]) {
      case "map":
        if (record(value))
          for (const child of Object.values(value)) visitSchema(child, visit);
        break;
      case "list":
        if (Array.isArray(value))
          for (const child of value) visitSchema(child, visit);
        break;
      case "schema":
        visitSchema(value, visit);
    }
  }
}

function visitParameters(parameters: unknown, visit: Visitor) {
  if (!Array.isArray(parameters)) return;
  for (const parameter of parameters) {
    if (record(parameter)) visitSchema(parameter.schema, visit);
  }
}

function visitContent(owner: unknown, visit: Visitor) {
  if (!record(owner) || !record(owner.content)) return;
  for (const media of Object.values(owner.content)) {
    if (record(media)) visitSchema(media.schema, visit);
  }
}

function visitPathItem(item: Record<string, unknown>, visit: Visitor) {
  for (const [method, operation] of Object.entries(item)) {
    if (method === "parameters") visitParameters(operation, visit);
    if (!isOperationMethod(method) || !record(operation)) continue;
    for (const [key, value] of Object.entries(operation)) {
      if (key === "parameters") visitParameters(value, visit);
      else if (key === "requestBody") visitContent(value, visit);
      else if (key === "responses" && record(value)) {
        for (const [status, response] of Object.entries(value)) {
          if (!status.startsWith("x-")) visitContent(response, visit);
        }
      }
    }
  }
}

/**
 * Visits schema objects in `components.schemas`, parameters, request bodies, and responses.
 * Each object precedes its subschemas. The visitor does not follow `$ref` links or inspect annotation data and extensions.
 */
export function visitDocumentSchemas(document: unknown, visit: Visitor) {
  if (!record(document)) return;
  for (const [section, value] of Object.entries(document)) {
    if (!record(value)) continue;
    if (section === "components" && record(value.schemas)) {
      for (const schema of Object.values(value.schemas))
        visitSchema(schema, visit);
    } else if (section === "paths") {
      for (const [path, item] of Object.entries(value)) {
        if (path.startsWith("/") && record(item)) visitPathItem(item, visit);
      }
    }
  }
}

function definitionPath(ref: unknown) {
  if (typeof ref !== "string") return;
  const path = parseLocalPointer(ref);
  if (path && path.length >= 2 && path[0] === "$defs") return path;
}

function appendDefinitionSuffix(ref: string, path: string[]) {
  for (let i = 2; i < path.length; i++) ref += `/${pointerToken(path[i])}`;
  return ref;
}

/**
 * Creates a converter that moves Zod definitions into `components` and rewrites their local references.
 * A named root becomes a component reference. An anonymous root stays inline unless it refers to itself.
 * Registered names receive an `Input` suffix for inputs unless they already have it.
 */
export function schemaConverter(
  z: Zod,
  metadata: SchemaRegistry,
  components: Record<string, JSONSchema>,
) {
  const cache = {
    input: new WeakMap<ZodType, JSONSchema>(),
    output: new WeakMap<ZodType, JSONSchema>(),
  };
  return (
    schema: ZodType,
    io: "input" | "output",
    origin: string,
  ): JSONSchema => {
    const converted = cache[io].get(schema);
    if (converted) return converted;
    try {
      const namedComponent = (name: string) =>
        io === "input" && !name.endsWith("Input") ? `${name}Input` : name;
      const id = metadata.get(schema)?.id;
      let rootName = id && namedComponent(id);
      if (rootName && Object.hasOwn(components, rootName)) {
        const ref = { $ref: schemaRef(rootName) };
        cache[io].set(schema, ref);
        return ref;
      }
      const emitted: JSONSchema = z.toJSONSchema(schema, {
        target: "draft-2020-12",
        io,
        metadata,
        override({ zodSchema, jsonSchema }) {
          const global = z.globalRegistry.get(zodSchema);
          if (!global) return;
          for (const key of [
            "description",
            "title",
            "default",
            "examples",
            "format",
            "contentMediaType",
          ]) {
            if (global[key] !== undefined && jsonSchema[key] === undefined)
              jsonSchema[key] = global[key];
          }
        },
      });
      const defs = (emitted.$defs ?? {}) as Record<string, JSONSchema>;
      let scope: string | undefined;
      const inlineScope = () =>
        (scope ??= createHash("sha256")
          .update(io)
          .update(JSON.stringify(emitted))
          .digest("hex")
          .slice(0, 16));
      const anonymous = /^__schema\d+$/;
      const nameFor = (name: string) =>
        anonymous.test(name)
          ? `Inline${inlineScope()}_${name}`
          : namedComponent(name);
      const aliases = new Map<string, string>();
      for (const [name, def] of Object.entries(defs)) {
        if (
          !anonymous.test(name) ||
          !record(def) ||
          Object.keys(def).length !== 1
        )
          continue;
        const path = definitionPath(def.$ref);
        if (path && !anonymous.test(path[1])) {
          aliases.set(
            name,
            appendDefinitionSuffix(schemaRef(nameFor(path[1])), path),
          );
        }
      }
      if (
        Object.keys(defs).some(
          (name) => anonymous.test(name) && !aliases.has(name),
        )
      )
        inlineScope();
      delete emitted.$defs;
      delete emitted.$schema;
      const rewrite = (obj: JSONSchema) => {
        if (obj.$ref === "#") {
          rootName ??= `Inline${inlineScope()}_Root`;
          obj.$ref = schemaRef(rootName);
        } else {
          const path = definitionPath(obj.$ref);
          if (path)
            obj.$ref = appendDefinitionSuffix(
              aliases.get(path[1]) ?? schemaRef(nameFor(path[1])),
              path,
            );
        }
      };
      visitSchema(emitted, rewrite);
      for (const [name, definition] of Object.entries(defs)) {
        if (aliases.has(name)) continue;
        visitSchema(definition, rewrite);
        components[nameFor(name)] ??= definition;
      }
      if (rootName) components[rootName] ??= emitted;
      const result = rootName ? { $ref: schemaRef(rootName) } : emitted;
      cache[io].set(schema, result);
      return result;
    } catch (cause) {
      throw new Error(`Cannot convert ${io} schema for ${origin}`, { cause });
    }
  };
}
