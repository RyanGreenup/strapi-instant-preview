import Ajv2020 from "ajv/dist/2020.js";
import { expect, test } from "vitest";
import * as z from "zod/v4";

import modelFields from "../../dist/server/src/spec/model-fields.js";
import parameters from "../../dist/server/src/spec/parameters.js";
import schemas from "../../dist/server/src/spec/schemas.js";

const { createModelFields } = modelFields;
const { buildQueryParameters } = parameters;
const { schemaConverter } = schemas;

function build(
  query,
  upstreamFields,
  registry = z.registry(),
  corePopulate,
  components = Object.create(null),
) {
  const convert = schemaConverter(z, registry, components);
  return buildQueryParameters(
    query,
    (schema, origin) => convert(schema, "input", origin),
    components,
    upstreamFields,
    corePopulate,
  );
}

test("core fields accept indexed and comma-separated selections without allowing unknown fields", () => {
  const fields = z
    .array(z.enum(["title", "slug"]))
    .readonly()
    .describe("Select fields")
    .optional();
  const [parameter] = build({ fields }, fields);
  expect(parameter).toMatchObject({
    name: "fields",
    in: "query",
    required: false,
  });
  expect(parameter.style).toBeUndefined();
  expect(parameter.schema.description).toBe("Select fields");
  const validate = new Ajv2020().compile(parameter.schema);
  for (const value of [
    "title",
    "title, slug",
    "*",
    "id,documentId",
    ["title", "slug"],
    ["title", "documentId"],
  ]) {
    expect(validate(value), JSON.stringify(value)).toBe(true);
  }
  for (const value of [
    "title,parent",
    ["title", "unknown"],
    "title,",
    { title: true },
    ["title, slug", "documentId"],
  ]) {
    expect(validate(value), JSON.stringify(value)).toBe(false);
  }
});

test("query conversion preserves declared fields overrides and extra parameters", () => {
  const upstreamFields = z.array(z.enum(["title"])).optional();
  const query = {
    fields: z.array(z.enum(["slug"])),
    _q: z.string().optional(),
    locale: z.string().optional(),
  };
  const result = build(query, upstreamFields);
  expect(result).toEqual([
    {
      name: "fields",
      in: "query",
      required: true,
      schema: { type: "array", items: { type: "string", enum: ["slug"] } },
    },
    { name: "_q", in: "query", required: false, schema: { type: "string" } },
    {
      name: "locale",
      in: "query",
      required: false,
      schema: { type: "string" },
    },
  ]);
});

test("object branches in query composition use deepObject, but array items do not", () => {
  const fields = z.array(z.enum(["title"]));
  const sortObject = z.partialRecord(
    z.enum(["title"]),
    z.enum(["asc", "desc"]),
  );
  const pagination = z
    .intersection(
      z.object({ withCount: z.boolean().optional() }),
      z.union([
        z.object({ page: z.int(), pageSize: z.int() }),
        z.object({ start: z.int(), limit: z.int() }),
      ]),
    )
    .optional();
  const populate = z.xor([z.literal("*"), z.object({ parent: z.boolean() })]);
  const textOnly = z.intersection(
    z.union([z.string(), sortObject]),
    z.string(),
  );
  const registry = z.registry();
  registry.add(pagination, { id: "c/ms~PaginationInput" });
  const result = build(
    {
      fields,
      sort: z.union([z.string(), sortObject]),
      pagination,
      populate,
      indexed: z.array(sortObject),
      textOnly,
    },
    undefined,
    registry,
  );
  expect(
    result
      .filter((parameter) => parameter.style)
      .map(({ name, style, explode }) => ({ name, style, explode })),
  ).toEqual([
    { name: "sort", style: "deepObject", explode: true },
    { name: "pagination", style: "deepObject", explode: true },
    { name: "populate", style: "deepObject", explode: true },
  ]);
  expect(
    result.find((parameter) => parameter.name === "pagination"),
  ).toMatchObject({
    required: false,
    schema: {
      $ref: "#/components/schemas/c~1ms~0PaginationInput",
    },
  });
});

test("core populate keeps shorthand and types nested relations, media, components, and zone fragments", () => {
  const uid = "api::page.page";
  const component = "content.hero";
  const model = (attributes, options) => ({ info: {}, attributes, options });
  const populate = z
    .union([
      z.literal("*"),
      z.enum(["parent", "blocks", "hero"]),
      z.array(z.enum(["parent", "blocks", "hero"])),
    ])
    .optional();
  const corePopulate = {
    schema: populate,
    uid,
    fields: createModelFields({
      contentTypes: {
        [uid]: model(
          {
            title: { type: "string" },
            password: { type: "password" },
            parent: { type: "relation", relation: "manyToOne", target: uid },
            blocks: { type: "dynamiczone", components: [component] },
            hero: { type: "component", component },
            secret: { type: "component", component, private: true },
            internalHero: { type: "component", component },
            hiddenHero: { type: "component", component },
            related: { type: "relation", relation: "morphToMany" },
            missing: {
              type: "relation",
              relation: "morphToOne",
              target: "api::missing.missing",
            },
          },
          { privateAttributes: ["hiddenHero"] },
        ),
        "plugin::upload.file": model({ url: { type: "string" } }),
      },
      components: {
        [component]: model({
          heading: { type: "string" },
          image: { type: "media" },
        }),
      },
      privateAttributes: ["internalHero"],
    }),
  };
  const components = Object.create(null);
  const [parameter] = build(
    { populate },
    undefined,
    undefined,
    corePopulate,
    components,
  );
  expect(parameter).toMatchObject({
    name: "populate",
    required: false,
    style: "deepObject",
    explode: true,
  });
  const validate = new Ajv2020({ strict: false }).compile({
    ...parameter.schema,
    components: { schemas: components },
  });
  for (const value of [
    "*",
    "parent",
    ["parent", "blocks"],
    { parent: "true" },
    { parent: { populate: { parent: { fields: "title,documentId" } } } },
    { hero: { fields: ["heading"], populate: { image: { fields: "url" } } } },
    {
      blocks: {
        on: { [component]: { fields: "heading", populate: { image: true } } },
      },
    },
    { blocks: { populate: "*" } },
    {
      related: {
        on: {
          [uid]: { fields: "title" },
          "plugin::upload.file": { fields: "url" },
        },
      },
    },
  ]) {
    expect(validate(value), JSON.stringify(value)).toBe(true);
  }
  for (const value of [
    { title: true },
    { secret: true },
    { parent: { fields: "heading" } },
    { blocks: { on: { "other.tile": true } } },
    { blocks: { populate: { image: true } } },
    { parent: { fields: "password" } },
    { hero: { fields: "documentId" } },
    { internalHero: true },
    { hiddenHero: true },
    "related.parent",
    { related: { on: { [component]: true } } },
    { missing: { on: { [uid]: true } } },
  ]) {
    expect(validate(value), JSON.stringify(value)).toBe(false);
  }
  expect(
    build(
      { populate: z.literal("minimal") },
      undefined,
      undefined,
      corePopulate,
    ),
  ).toEqual([
    {
      name: "populate",
      in: "query",
      required: true,
      schema: { type: "string", const: "minimal" },
    },
  ]);
});

test("populate for an unknown model preserves the upstream schema", () => {
  const populate = z.literal("minimal");
  const fields = createModelFields({ contentTypes: {}, components: {} });
  expect(
    build({ populate }, undefined, undefined, {
      uid: "missing",
      schema: populate,
      fields,
    }),
  ).toEqual(build({ populate }));
});
