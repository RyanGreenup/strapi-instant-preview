import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { test, expect } from "vitest";
import * as z from "zod/v4";

import path from "../../dist/server/src/catalog/path.js";
import normalize from "../../dist/server/src/contract/normalize.js";
import builders from "../../dist/server/src/schemas/index.js";
import { assemble } from "../../dist/server/src/spec/assemble.js";
import conversion from "../../dist/server/src/spec/schemas.js";
import checks from "../../dist/server/src/spec/self-check.js";

const { joinPath, normalizePath } = path;
const { normalizeRouteResponse } = normalize;
const { createSchemas } = builders;
const { schemaConverter } = conversion;
const { selfCheck } = checks;

const uid = "api::entry.entry";
const component = "shared.note";
const second = "shared.link";
const model = (singularName, attributes) => ({
  info: { singularName },
  attributes,
});
const schemas = createSchemas(
  z,
  {
    contentTypes: {
      [uid]: model("entry", {
        title: { type: "string", required: true, minLength: 3, maxLength: 8 },
        text: { type: "text" },
        rich: { type: "richtext" },
        email: { type: "email" },
        slug: { type: "uid" },
        integer: {
          type: "integer",
          required: true,
          min: 0,
          max: 9,
          default: 0,
        },
        float: { type: "float" },
        decimal: { type: "decimal" },
        big: { type: "biginteger" },
        active: { type: "boolean" },
        day: { type: "date" },
        when: { type: "datetime" },
        time: { type: "time" },
        timestamp: { type: "timestamp" },
        payload: { type: "json" },
        pass: { type: "password" },
        option: { type: "enumeration", enum: ["a", "b"] },
        blocks: { type: "blocks" },
        parent: { type: "relation", relation: "manyToOne", target: uid },
        default: { type: "relation", relation: "manyToOne", target: uid },
        peers: { type: "relation", relation: "manyToMany", target: uid },
        morph: { type: "relation", relation: "morphToMany" },
        media: { type: "media" },
        gallery: { type: "media", multiple: true },
        note: { type: "component", component },
        zone: { type: "dynamiczone", components: [component, second] },
        color: { type: "customField", baseType: "string" },
      }),
      "plugin::upload.file": model("file", { name: { type: "string" } }),
    },
    components: {
      [component]: model("note", {
        text: { type: "text" },
        pass: { type: "password" },
      }),
      [second]: model("link", { url: { type: "string" } }),
    },
  },
  { documentIdPattern: "loose" },
);

function validator(schema, io, registry = schemas.registry) {
  const components = Object.create(null);
  const convert = schemaConverter(z, registry, components);
  const converted = convert(schema, io, "unit test");
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  return {
    validate: ajv.compile({
      ...converted,
      components: { schemas: components },
    }),
    components,
  };
}

const doc = { id: 1, documentId: "example" };

test("status maps retain bodyless and override statuses", () => {
  const response = z.string();
  expect(normalizeRouteResponse(response, z)).toEqual([
    { status: 200, schema: response },
  ]);
  expect(normalizeRouteResponse({ 204: null, 409: response }, z)).toEqual([
    { status: 204, schema: null },
    { status: 409, schema: response },
  ]);
  expect(() => normalizeRouteResponse({ 42: null }, z)).toThrow();
});

test("path joining and normalization keep patterns for distinct parameter names", () => {
  expect(
    normalizePath(joinPath("/admin//", "/posts/:id(\\d+)/(foo|bar)/(.*)/")),
  ).toEqual({
    ok: true,
    value: {
      openapiPath: "/admin/posts/{id}/{wildcard}/{wildcard2}",
      templateShape: "/admin/posts/{}/{}/{}",
      pathParams: [
        { name: "id", pattern: "^(?:\\d+)$" },
        { name: "wildcard", pattern: "^(?:foo|bar)$" },
        { name: "wildcard2", pattern: "^(?:.*)$" },
      ],
    },
  });
});

test("path normalization keeps brace affixes and literal groups out of parameter names", () => {
  expect(normalizePath("//posts{/:id.json}{/download}/")).toEqual({
    ok: true,
    value: {
      openapiPath: "/posts/{id}.json/download",
      templateShape: "/posts/{}.json/download",
      pathParams: [{ name: "id" }],
    },
  });
  expect(normalizePath("///")).toEqual({
    ok: true,
    value: { openapiPath: "/", templateShape: "/", pathParams: [] },
  });
});

test.each([
  ["/posts/:id?", "Optional or repeated path parameter id"],
  ["/posts/:id+", "Optional or repeated path parameter id"],
  ["/posts/:id*", "Optional or repeated path parameter id"],
  ["/posts/:wildcard/(.*)", "Duplicate path parameter wildcard"],
  ["/posts{/download}?", "Optional or repeated path segment /download"],
])("returns an error with a stack for %s", (route, message) => {
  const result = normalizePath(route);
  expect(result.ok).toBe(false);
  expect(result.error.message).toContain(message);
  expect(result.error.stack).toContain("normalizePath");
});

test("retains the original parser stack for malformed syntax", () => {
  const result = normalizePath("/posts/:id(");
  expect(result.ok).toBe(false);
  expect(result.error.message).toContain("Unbalanced pattern");
  expect(result.error.cause.stack).toContain("path-to-regexp");
});

test("wire schemas preserve nullability, recursive links, counts, blocks and required identifiers", () => {
  const { validate, components } = validator(schemas.document(uid), "output");
  const good = {
    ...doc,
    title: null,
    text: "text",
    rich: "# Heading",
    email: "draft",
    slug: "draft",
    integer: 1,
    float: 0.5,
    decimal: 0.25,
    big: "9007199254740993",
    active: false,
    day: "2026-01-01",
    when: "2026-01-01T00:00:00.000Z",
    time: "12:30:00.123456",
    timestamp: "1767225600000",
    payload: ["JSON"],
    option: "a",
    color: "#fff",
    parent: { ...doc, parent: { count: 1 } },
    peers: { count: 2 },
    default: { ...doc },
    morph: [{ __type: uid }],
    media: null,
    gallery: [{ ...doc, name: "cover" }],
    note: { id: 2, text: "note" },
    zone: [
      { id: 3, __component: component },
      { id: 4, __component: second },
    ],
    blocks: [
      {
        type: "list",
        format: "unordered",
        children: [
          { type: "list-item", children: [{ type: "text", text: "nested" }] },
        ],
      },
    ],
  };
  expect(validate(good), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({ ...doc, title: "x", integer: -1 })).toBe(true);
  expect(components.EntryDocument.properties).not.toHaveProperty("pass");
  expect(validate({ id: 1 })).toBe(false);
  for (const invalid of [
    { title: 1 },
    { title: "too large" },
    { text: 1 },
    { rich: [] },
    { email: 1 },
    { slug: 1 },
    { integer: 1.2 },
    { integer: 10 },
    { float: "1" },
    { decimal: "1" },
    { big: 1 },
    { active: "true" },
    { day: "2026-02-31" },
    { when: 0 },
    { time: "12:30:00.1234567" },
    { timestamp: 1 },
    { option: "c" },
    { color: false },
    { parent: {} },
    { peers: [doc.id] },
    { morph: [{}] },
    { gallery: null },
    { note: {} },
    { zone: [{ id: 2 }] },
    { blocks: [{ type: "paragraph", children: [{ type: "text" }] }] },
  ])
    expect(validate({ ...doc, ...invalid }), JSON.stringify(invalid)).toBe(
      false,
    );
});

test("input defaults stay optional, create constraints do not leak into partial updates", () => {
  for (const io of ["input", "output"]) {
    const { validate, components } = validator(schemas.input(uid), io);
    expect(components.EntryInput.properties.integer.default).toBe(0);
    expect(
      validate({
        title: "Ready",
        pass: "secret",
        big: 42,
        parent: { connect: [{ documentId: "other" }] },
      }),
    ).toBe(true);
    expect(validate({ title: "x" })).toBe(false);
    expect(validate({})).toBe(false);
  }
  const { validate } = validator(schemas.input(uid, true), "input");
  expect(validate({})).toBe(true);
  expect(validate({ title: "x" })).toBe(false);
});

test("draft and published requests treat conditional visibility, defaults and constraints differently", () => {
  const conditional = createSchemas(
    z,
    {
      contentTypes: {
        [uid]: model("entry", {
          title: {
            type: "string",
            required: true,
            minLength: 3,
            maxLength: 12,
          },
          kind: {
            type: "enumeration",
            enum: ["article", "external"],
            default: "article",
          },
          body: {
            type: "string",
            required: true,
            conditions: { visible: { "!=": [{ var: "kind" }, "external"] } },
          },
          url: {
            type: "string",
            required: true,
            regex: "^https://",
            conditions: { visible: { "==": [{ var: "kind" }, "external"] } },
          },
        }),
      },
      components: {},
    },
    { documentIdPattern: "loose" },
  );
  const published = validator(
    conditional.input(uid),
    "input",
    conditional.registry,
  ).validate;
  const draft = validator(
    conditional.input(uid, false, true),
    "input",
    conditional.registry,
  ).validate;
  expect(published({ title: "Title", body: "Body" })).toBe(true);
  expect(published({ title: "Title" })).toBe(false);
  expect(
    published({
      title: "Title",
      kind: "external",
      url: "https://example.test",
    }),
  ).toBe(true);
  expect(published({ title: "Title", kind: "external", url: null })).toBe(
    false,
  );
  expect(draft({ kind: "external", title: "x", url: "not finished" })).toBe(
    true,
  );
  expect(draft({ title: "exceeds the max" })).toBe(false);
});

test.each([
  ["==", 1, [false, true, true, false]],
  ["===", 1, [true, true, true, true]],
  ["!=", 1, [true, false, false, true]],
  ["==", null, [true, true, false, true]],
])(
  "published create evaluates enum %s %s including null and the omitted default",
  (op, expected, accepted) => {
    const entry = model("entry", {
      kind: { type: "enumeration", enum: ["1", "2"], default: "1" },
      dependent: {
        type: "string",
        required: true,
        conditions: { visible: { [op]: [{ var: "kind" }, expected] } },
      },
    });
    const schemas = createSchemas(
      z,
      { contentTypes: { [uid]: entry }, components: {} },
      { documentIdPattern: "loose" },
    );
    const { validate } = validator(
      schemas.input(uid),
      "input",
      schemas.registry,
    );
    expect(
      [{ kind: "1" }, { kind: "2" }, { kind: null }, {}].map((value) =>
        validate(value),
      ),
    ).toEqual(accepted);
  },
);

test("unrepresentable loose comparisons warn on the affected field and fail strict generation", () => {
  const entry = {
    kind: "collectionType",
    info: { singularName: "entry", pluralName: "entries" },
    attributes: {
      kind: { type: "string" },
      detail: {
        type: "string",
        required: true,
        conditions: { visible: { "==": [{ var: "kind" }, 1] } },
      },
    },
  };
  const route = { method: "POST", path: "/entries", handler: `${uid}.create` };
  const app = {
    dirs: { app: { root: process.cwd() } },
    server: {},
    config: { get: (_, fallback) => fallback },
    contentTypes: { [uid]: entry },
    components: {},
    plugins: {},
    apis: { entry: { routes: { main: { routes: [route] } } } },
  };
  const warning = `${uid}.detail: cannot represent loose visibility condition`;
  expect(assemble(app, { strict: false }).coverage.warnings).toContain(warning);
  expect(() => assemble(app)).toThrow(warning);
});

test("strict non-draft responses still allow a model-declared published timestamp", () => {
  const models = {
    contentTypes: {
      [uid]: model("entry", { publishedAt: { type: "datetime" } }),
    },
    components: {},
  };
  const strict = createSchemas(z, models, {
    documentIdPattern: "loose",
    strictResponseObjects: true,
  });
  const { validate } = validator(
    strict.document(uid),
    "output",
    strict.registry,
  );
  expect(validate({ ...doc, publishedAt: "2026-01-02T00:00:00.000Z" })).toBe(
    true,
  );
  expect(validate({ ...doc, publishedAt: 1 })).toBe(false);
  expect(validate({ ...doc, publishedAt: null })).toBe(false);
  expect(validate({ ...doc, createdAt: null })).toBe(false);
  expect(validate({ ...doc, discarded: true })).toBe(false);
});

test("polymorphic entries are typed per model and tagged by __type", async () => {
  const fileUid = "plugin::upload.file";
  const typed = createSchemas(
    z,
    {
      contentTypes: {
        "api::post.post": model("post", {
          title: { type: "string" },
          cover: { type: "media" },
        }),
        "api::page.page": model("page", {
          body: { type: "text" },
          hero: { type: "component", component: "shared.hero" },
        }),
        "api::plain.plain": model("plain", { name: { type: "string" } }),
        [fileUid]: model("file", {
          name: { type: "string" },
          related: { type: "relation", relation: "morphToMany" },
        }),
      },
      components: {
        "shared.hero": model("hero", { image: { type: "media" } }),
      },
    },
    { documentIdPattern: "loose", strictResponseObjects: true },
  );
  const { validate, components } = validator(
    typed.file,
    "output",
    typed.registry,
  );
  const file = (related) => ({
    id: 1,
    documentId: "file",
    name: "a.png",
    related,
  });
  expect(
    validate(
      file([
        { __type: "api::post.post", id: 1, title: "Post" },
        {
          __type: "api::post.post",
          id: 2,
          documentId: "post",
          title: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        { __type: "shared.hero", id: 3 },
      ]),
    ),
  ).toBe(true);
  expect(validate(file({ count: 2 }))).toBe(true);
  expect(
    validate(file([{ __type: "api::plain.plain", id: 1, name: "x" }])),
  ).toBe(false);
  expect(
    validate(file([{ __type: "api::post.post", id: 1, bogus: true }])),
  ).toBe(false);
  expect(validate(file([{ __type: "api::post.post", id: 1, title: 42 }]))).toBe(
    false,
  );
  expect(validate(file([{ __type: "api::post.post", title: "no id" }]))).toBe(
    false,
  );
  expect(
    Object.keys(components)
      .filter((name) => name.endsWith("MorphEntry"))
      .sort(),
  ).toEqual(["HeroMorphEntry", "PostMorphEntry"]);
});

test("a morph relation without known inverse attributes stays open", () => {
  const { validate } = validator(schemas.document(uid), "output");
  expect(
    validate({ ...doc, morph: [{ __type: "anything", id: 1, extra: "kept" }] }),
  ).toBe(true);
});

test("error bodies pin error.status to the HTTP status", () => {
  const { validate } = validator(schemas.errorFor(404), "output");
  const body = (status) => ({
    data: null,
    error: { status, name: "NotFoundError", message: "Not Found", details: {} },
  });
  expect(validate(body(404))).toBe(true);
  expect(validate(body(400))).toBe(false);
  expect(validate({ data: {}, error: body(404).error })).toBe(false);
});

test("the self-check rejects oneOf branches without a disjoint required tag", () => {
  const document = (branches, extra = {}) => ({
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    servers: [],
    paths: {},
    components: {
      securitySchemes: {},
      schemas: {
        A: {
          type: "object",
          properties: { kind: { const: "a" } },
          required: ["kind"],
        },
        B: {
          type: "object",
          properties: { kind: { const: "b" } },
          required: ["kind"],
        },
        Loose: { type: "object", properties: { kind: { const: "b" } } },
        Same: {
          type: "object",
          properties: { kind: { const: "a" } },
          required: ["kind"],
        },
        Holder: { oneOf: branches },
        ...extra,
      },
    },
  });
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  expect(() => selfCheck(document([ref("A"), ref("B")]), [])).not.toThrow();
  expect(() => selfCheck(document([ref("A"), ref("Same")]), [])).toThrow(
    /not discriminated/,
  );
  expect(() => selfCheck(document([ref("A"), ref("Loose")]), [])).toThrow(
    /not discriminated/,
  );
  expect(() =>
    selfCheck(document([{ type: "array" }, { type: "integer" }]), []),
  ).toThrow(/not discriminated/);
});
