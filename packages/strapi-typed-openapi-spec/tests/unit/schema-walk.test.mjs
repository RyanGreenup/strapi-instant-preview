import { expect, test } from "vitest";
import * as z from "zod/v4";

import conversion from "../../dist/server/src/spec/schemas.js";

const { schemaConverter, visitDocumentSchemas } = conversion;

test("document traversal visits only schema positions, in document order", () => {
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  const content = (name) => ({
    content: {
      "application/json": { schema: ref(name), example: ref("ignored") },
    },
  });
  const parameters = (name) => [{ schema: ref(name), example: ref("ignored") }];
  const document = {
    info: { schema: ref("ignored") },
    paths: {
      "x-metadata": { get: { parameters: parameters("ignored") } },
      "/thing": {
        parameters: parameters("Path"),
        post: {
          requestBody: content("Body"),
          parameters: parameters("Operation"),
          responses: {
            201: content("Result"),
            "x-metadata": content("ignored"),
          },
        },
        "x-extra": { parameters: parameters("ignored") },
      },
    },
    components: {
      parameters: { Unused: { schema: ref("ignored") } },
      schemas: {
        Model: {
          default: ref("ignored"),
          examples: [ref("ignored")],
          enum: [ref("ignored")],
          const: ref("ignored"),
          "x-extra": { items: ref("ignored") },
          properties: { default: ref("Field"), flag: false },
          anyOf: [true, { additionalProperties: ref("Nested") }],
        },
      },
    },
  };
  const visited = [];
  visitDocumentSchemas(document, (schema) => {
    if ("$ref" in schema) visited.push(schema.$ref);
  });
  expect(visited).toEqual(
    ["Path", "Body", "Operation", "Result", "Field", "Nested"].map(
      (name) => ref(name).$ref,
    ),
  );
});

test("schema traversal handles each map, list and single-schema keyword", () => {
  const root = {};
  for (const key of [
    "properties",
    "patternProperties",
    "dependentSchemas",
    "$defs",
    "definitions",
  ]) {
    root[key] = { enum: { title: key } };
  }
  for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"])
    root[key] = [false, { title: key }];
  for (const key of [
    "additionalProperties",
    "unevaluatedProperties",
    "propertyNames",
    "items",
    "contains",
    "unevaluatedItems",
    "not",
    "if",
    "then",
    "else",
    "contentSchema",
  ])
    root[key] = { title: key };
  const titles = [];
  visitDocumentSchemas({ components: { schemas: { root } } }, (schema) =>
    titles.push(schema.title),
  );
  expect(titles).toEqual([undefined, ...Object.keys(root)]);
});

test("schema conversion preserves suffixes through escaped definition names and anonymous aliases", () => {
  const registry = z.registry();
  const schema = z.unknown();
  const alias = "#/$defs/__schema0/properties/a~0b%25";
  const target = "#/$defs/Group%2F~0/properties/inner~1child";
  const external = "https://example.com/schema#/$defs/Group";
  registry.add(schema, {
    $defs: {
      "Group/~": {
        properties: {
          "inner/child": { properties: { "a~b%": { type: "string" } } },
        },
      },
      __schema0: { $ref: target },
      Consumer: { $ref: alias },
    },
    properties: {
      indirect: { $ref: alias },
      direct: { $ref: target },
      external: { $ref: external },
    },
    default: { $ref: alias },
  });
  const components = {};
  const converted = schemaConverter(z, registry, components)(
    schema,
    "input",
    "alias test",
  );
  const inner = "#/components/schemas/Group~1~0Input/properties/inner~1child";
  const field = `${inner}/properties/a~0b%25`;
  expect(converted.properties).toEqual({
    indirect: { $ref: field },
    direct: { $ref: inner },
    external: { $ref: external },
  });
  expect(converted.default).toEqual({ $ref: alias });
  expect(Object.keys(components)).toEqual(["Group/~Input", "ConsumerInput"]);
  expect(components.ConsumerInput).toEqual({ $ref: field });
});
