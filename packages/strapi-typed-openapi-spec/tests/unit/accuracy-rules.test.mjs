import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { test, expect } from "vitest";
import * as z from "zod/v4";

import builders from "../../dist/server/src/schemas/index.js";
import numeric from "../../dist/server/src/schemas/numeric-strings.js";
import conversion from "../../dist/server/src/spec/schemas.js";

const { createSchemas } = builders;
const { schemaConverter } = conversion;
const { COERCE_NUMERIC_STRINGS_EXTENSION, coercesNumericStringKey } = numeric;

const model = (singularName, attributes, options) => ({
  info: { singularName },
  attributes,
  ...(options && { options }),
});

function convert(schemas, schema, io) {
  const components = Object.create(null);
  const converted = schemaConverter(z, schemas.registry, components)(
    schema,
    io,
    "unit test",
  );
  return { converted, components };
}

function validator(schemas, schema, io) {
  const { converted, components } = convert(schemas, schema, io);
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  return ajv.compile({ ...converted, components: { schemas: components } });
}

const property = (components, name, key) => {
  const node = components[name].properties[key];
  return node.anyOf
    ? node.anyOf.find((branch) => branch.type !== "null")
    : node;
};

test("numeric inputs keep the number type and carry the coercion extension", () => {
  expect(COERCE_NUMERIC_STRINGS_EXTENSION).toBe(true);
  const uid = "api::count.count";
  const schemas = createSchemas(
    z,
    {
      contentTypes: {
        [uid]: model("count", {
          whole: { type: "integer" },
          ratio: { type: "float" },
          money: { type: "decimal" },
          big: { type: "biginteger" },
          label: { type: "string" },
        }),
      },
      components: {},
    },
    { documentIdPattern: "loose" },
  );
  const { components } = convert(schemas, schemas.input(uid), "input");
  expect(property(components, "CountInput", "whole")).toMatchObject({
    type: "integer",
    [coercesNumericStringKey]: true,
  });
  expect(property(components, "CountInput", "ratio")).toMatchObject({
    type: "number",
    [coercesNumericStringKey]: true,
  });
  expect(property(components, "CountInput", "money")).toMatchObject({
    type: "number",
    [coercesNumericStringKey]: true,
  });
  expect(
    property(components, "CountInput", "big")[coercesNumericStringKey],
  ).toBeUndefined();
  expect(
    property(components, "CountInput", "label")[coercesNumericStringKey],
  ).toBeUndefined();

  // Responses always send numbers.
  const output = convert(schemas, schemas.document(uid), "output").components;
  expect(JSON.stringify(output)).not.toContain(coercesNumericStringKey);
  // The contract still rejects a numeric string: the extension only documents Strapi's cast.
  expect(validator(schemas, schemas.input(uid), "input")({ whole: "12" })).toBe(
    false,
  );
});

const post = "api::post.post";
const person = "api::person.person";
const tag = "api::tag.tag";
const fileUid = "plugin::upload.file";
const pluginItem = "plugin::shop.item";
const stateModels = {
  contentTypes: {
    [post]: model(
      "post",
      {
        title: { type: "string", required: true, minLength: 3 },
        rank: { type: "integer", min: 1 },
        teaser: {
          type: "string",
          required: true,
          conditions: { visible: { "==": [{ var: "rank" }, 1] } },
        },
        author: { type: "relation", relation: "manyToOne", target: person },
        tag: { type: "relation", relation: "manyToOne", target: tag },
        cover: { type: "media", required: true },
        note: { type: "component", component: "shared.note", required: true },
        notes: {
          type: "component",
          component: "shared.note",
          repeatable: true,
          min: 2,
        },
      },
      { draftAndPublish: true },
    ),
    [person]: model(
      "person",
      { name: { type: "string", required: true } },
      { draftAndPublish: true },
    ),
    [tag]: model("tag", {
      label: { type: "string", required: true },
      posts: { type: "relation", relation: "oneToMany", target: post },
    }),
    [fileUid]: model("file", { name: { type: "string", required: true } }),
    [pluginItem]: model("item", { name: { type: "string", required: true } }),
  },
  components: {
    "shared.note": model("note", {
      text: { type: "string", required: true, minLength: 2 },
    }),
  },
};
const published = {
  id: 1,
  documentId: "p",
  publishedAt: "2026-01-01T00:00:00.000Z",
};
const draft = { id: 2, documentId: "d", publishedAt: null };

function stateSchemas(options = {}) {
  return createSchemas(z, stateModels, {
    documentIdPattern: "loose",
    strictResponseObjects: true,
    ...options,
  });
}

test("a published document asserts required values and published-only bounds", () => {
  const schemas = stateSchemas();
  const validate = validator(schemas, schemas.content(post), "output");
  expect(validate({ ...published, title: "Hello", rank: 1 })).toBe(true);
  expect(validate({ ...published, title: null })).toBe(false);
  expect(validate({ ...published, title: "ab" })).toBe(false);
  expect(validate({ ...published, rank: 0 })).toBe(false);
  expect(validate({ ...published, note: null })).toBe(false);
  expect(validate({ ...published, note: { id: 1, text: "x" } })).toBe(false);
  expect(validate({ ...published, notes: [{ id: 1, text: "ok" }] })).toBe(
    false,
  );
  // An optional repeatable component may be empty despite its minimum.
  expect(validate({ ...published, notes: [] })).toBe(true);
  // Hidden (conditional) fields, relations and media are not required.
  expect(
    validate({ ...published, teaser: null, author: null, cover: null }),
  ).toBe(true);
});

test("a draft document keeps only the rules Strapi checks on drafts", () => {
  const schemas = stateSchemas();
  const validate = validator(schemas, schemas.content(post), "output");
  expect(
    validate({
      ...draft,
      title: null,
      rank: 0,
      note: null,
      notes: [{ id: 1, text: "x" }],
    }),
  ).toBe(true);
  expect(validate({ ...draft, title: "x".repeat(256) })).toBe(false);
});

test("populated draft-and-publish relations follow the state of their owner", () => {
  const schemas = stateSchemas();
  const validate = validator(schemas, schemas.content(post), "output");
  const publishedAuthor = {
    id: 3,
    documentId: "a",
    name: "Ann",
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
  const draftAuthor = { id: 4, documentId: "a", name: null, publishedAt: null };
  expect(validate({ ...published, author: publishedAuthor })).toBe(true);
  expect(validate({ ...published, author: draftAuthor })).toBe(false);
  expect(validate({ ...draft, author: draftAuthor })).toBe(true);
  expect(validate({ ...draft, author: publishedAuthor })).toBe(false);
  // A type without draft and publish is always published, in either state of its owner.
  const label = {
    id: 5,
    documentId: "t",
    label: "News",
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
  expect(validate({ ...draft, tag: label })).toBe(true);
  expect(validate({ ...draft, tag: { ...label, label: null } })).toBe(false);
  expect(validate({ ...draft, tag: { ...label, publishedAt: null } })).toBe(
    false,
  );
});

test("a type without draft and publish has one published shape but status-independent relations", () => {
  const schemas = stateSchemas();
  const validate = validator(schemas, schemas.content(tag), "output");
  const base = {
    id: 1,
    documentId: "t",
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
  expect(validate({ ...base, label: null })).toBe(false);
  // status=draft on this type still populates draft versions of its relations.
  expect(
    validate({
      ...base,
      label: "News",
      posts: [
        { ...draft, title: null },
        { ...published, title: "Hello" },
      ],
    }),
  ).toBe(true);
  expect(schemas.statusResponses(tag, true)).toBeUndefined();
});

test("per-status envelopes exist for draft-and-publish types", () => {
  const schemas = stateSchemas();
  const { published: listPublished, draft: listDraft } =
    schemas.statusResponses(post, true);
  const body = (entry) => ({
    data: [entry],
    meta: { pagination: { page: 1, pageSize: 25 } },
  });
  expect(
    validator(
      schemas,
      listPublished,
      "output",
    )(body({ ...published, title: "Hello" })),
  ).toBe(true);
  expect(
    validator(
      schemas,
      listPublished,
      "output",
    )(body({ ...draft, title: "Hello" })),
  ).toBe(false);
  expect(
    validator(schemas, listDraft, "output")(body({ ...draft, title: null })),
  ).toBe(true);
});

test("plugin models and the switched-off mode keep the status-independent shape", () => {
  const schemas = stateSchemas();
  expect(
    validator(
      schemas,
      schemas.content(pluginItem),
      "output",
    )({ id: 1, documentId: "i", name: null }),
  ).toBe(true);
  // The upload service sets every required file scalar, so only the switched-off
  // mode lets them be null.
  const unnamedFile = { id: 1, documentId: "f", name: null };
  expect(validator(schemas, schemas.file, "output")(unnamedFile)).toBe(false);
  const off = stateSchemas({ publishedResponseRules: false });
  expect(validator(off, off.file, "output")(unnamedFile)).toBe(true);
  const validate = validator(off, off.content(post), "output");
  expect(validate({ ...published, title: null, rank: 0 })).toBe(true);
  expect(off.statusResponses(post, true)).toBeUndefined();
});

test("only portable regexes become JSON Schema patterns", async () => {
  const { portablePattern } = (
    await import("../../dist/server/src/schemas/regex.js")
  ).default;
  expect(portablePattern("^[a-z0-9-]+$")).toBe(true);
  expect(portablePattern(String.raw`^\d{3}(?:-\d{4})?$`)).toBe(true);
  expect(portablePattern(String.raw`^[\w\-]+$`)).toBe(true);
  // Invalid or different in Unicode mode, or locale/astral sensitive.
  expect(portablePattern(String.raw`^\_+$`)).toBe(false);
  expect(portablePattern("^.+$")).toBe(false);
  expect(portablePattern("^[^a]+$")).toBe(false);
  expect(portablePattern("^(?=a)a$")).toBe(false);
  expect(portablePattern("^é$")).toBe(false);
});

test("published inputs check regexes as Strapi does, without emitting unportable patterns", () => {
  const uid = "api::code.code";
  const schemas = createSchemas(
    z,
    {
      contentTypes: {
        [uid]: model("code", {
          sku: { type: "string", regex: "^[A-Z]{3}$" },
          ref: {
            type: "string",
            regex: String.raw`^\_[a-z]+$`,
            required: true,
          },
          slug: { type: "uid", regex: "^[a-z]+$" },
        }),
      },
      components: {},
    },
    { documentIdPattern: "loose" },
  );
  const { components } = convert(schemas, schemas.input(uid), "input");
  const sku = property(components, "CodeInput", "sku");
  expect(sku.pattern).toBe("^$|^[A-Z]{3}$");
  const ref = property(components, "CodeInput", "ref");
  expect(ref.pattern).toBeUndefined();
  expect(ref["x-strapi-regex"]).toBe(String.raw`^\_[a-z]+$`);

  const validate = validator(schemas, schemas.input(uid), "input");
  // An optional field skips the pattern for "" (yup excludeEmptyString); a uid does not.
  expect(validate({ ref: "_ok", sku: "" })).toBe(true);
  expect(validate({ ref: "_ok", sku: "ABC" })).toBe(true);
  expect(validate({ ref: "_ok", sku: "abc" })).toBe(false);
  expect(validate({ ref: "_ok", slug: "" })).toBe(false);
  // Zod still enforces the unportable pattern.
  expect(schemas.input(uid).safeParse({ ref: "nope" }).success).toBe(false);
  expect(schemas.input(uid).safeParse({ ref: "_ok" }).success).toBe(true);
});

const conditionalModel = (visible, extra = {}) => ({
  contentTypes: {
    "api::form.form": model("form", {
      kind: { type: "enumeration", enum: ["a", "b", "c"], default: "a" },
      flag: { type: "boolean", default: false },
      code: { type: "string" },
      target: { type: "string", required: true, conditions: { visible } },
      ...extra,
    }),
  },
  components: {},
});

test.each([
  [
    "and",
    {
      and: [
        { "==": [{ var: "kind" }, "b"] },
        { "==": [{ var: "flag" }, true] },
      ],
    },
    [
      [{ kind: "b", flag: true }, false],
      [{ kind: "b", flag: false }, true],
      [{ kind: "a", flag: true }, true],
    ],
  ],
  [
    "or",
    {
      or: [
        { "===": [{ var: "kind" }, "b"] },
        { "===": [{ var: "kind" }, "c"] },
      ],
    },
    [
      [{ kind: "b" }, false],
      [{ kind: "c" }, false],
      [{ kind: "a" }, true],
      [{}, true],
    ],
  ],
  [
    "in",
    { in: [{ var: "kind" }, ["b", "c"]] },
    [
      [{ kind: "c" }, false],
      [{}, true],
    ],
  ],
  [
    "!",
    { "!": { "==": [{ var: "kind" }, "a"] } },
    [
      [{ kind: "b" }, false],
      [{}, true],
      [{ kind: null }, false],
    ],
  ],
  [
    "open string domain",
    { "==": [{ var: "code" }, "X"] },
    [
      [{ code: "X" }, false],
      [{ code: "Y" }, true],
      [{}, true],
    ],
  ],
])("published create compiles %s visibility rules", (_, visible, cases) => {
  const schemas = createSchemas(z, conditionalModel(visible), {
    documentIdPattern: "loose",
  });
  expect(schemas.warnings).toEqual([]);
  const validate = validator(schemas, schemas.input("api::form.form"), "input");
  for (const [body, accepted] of cases)
    expect([body, validate(body)]).toEqual([body, accepted]);
});

test("a published response requires a visible conditional field to be non-null when the condition is known", () => {
  const schemas = createSchemas(
    z,
    conditionalModel({ "==": [{ var: "kind" }, "b"] }),
    { documentIdPattern: "loose", strictResponseObjects: true },
  );
  const validate = validator(
    schemas,
    schemas.content("api::form.form"),
    "output",
  );
  const base = {
    id: 1,
    documentId: "f",
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
  expect(validate({ ...base, kind: "b", target: null })).toBe(false);
  expect(validate({ ...base, kind: "b", target: "x" })).toBe(true);
  expect(validate({ ...base, kind: "a", target: null })).toBe(true);
  // `fields` can leave out the controlling field: then the visibility is unknown.
  expect(validate({ ...base, target: null })).toBe(true);
});

test("unsupported rules stay relaxed, and every rule is published in x-strapi-conditions", () => {
  const visible = { "<": [{ var: "code" }, "m"] };
  const schemas = createSchemas(z, conditionalModel(visible), {
    documentIdPattern: "loose",
    strictResponseObjects: true,
  });
  expect(schemas.warnings).toEqual([]);
  expect(
    validator(schemas, schemas.input("api::form.form"), "input")({ code: "a" }),
  ).toBe(true);
  const { components } = convert(
    schemas,
    schemas.input("api::form.form"),
    "input",
  );
  expect(components.FormInput["x-strapi-conditions"]).toEqual({
    target: visible,
  });
  const output = convert(
    schemas,
    schemas.content("api::form.form"),
    "output",
  ).components;
  expect(output.FormDocument["x-strapi-conditions"]).toEqual({
    target: visible,
  });
});

const visibleWhenB = { "==": [{ var: "kind" }, "b"] };
const gatedModel = () =>
  conditionalModel(visibleWhenB, {
    url: {
      type: "string",
      regex: "^https://",
      maxLength: 20,
      conditions: { visible: visibleWhenB },
    },
    pick: {
      type: "enumeration",
      enum: ["x", "y"],
      conditions: { visible: visibleWhenB },
    },
  });

test("a hidden field skips every rule, and a visible one keeps them on create", () => {
  // Strapi validates nothing on a field its condition hides (entity-validator createAttributeValidator)
  const schemas = createSchemas(z, gatedModel(), {
    documentIdPattern: "loose",
    strictResponseObjects: true,
  });
  const create = validator(schemas, schemas.input("api::form.form"), "input");
  expect(
    create({
      kind: "a",
      url: "ftp://longer-than-twenty-characters",
      pick: "other",
    }),
  ).toBe(true);
  expect(create({ kind: "b", target: "t", url: "ftp://x" })).toBe(false);
  expect(
    create({ kind: "b", target: "t", url: "https://a", pick: "other" }),
  ).toBe(false);
  expect(create({ kind: "b", target: "t", url: "https://a", pick: "x" })).toBe(
    true,
  );
  expect(create({ kind: "b", target: "t", url: null, pick: null })).toBe(true);
  // A hidden value still has to fit its varchar(255) column
  expect(create({ kind: "a", url: "!".repeat(256) })).toBe(false);

  // An update can depend on stored values, so the rules stay relaxed
  const update = validator(
    schemas,
    schemas.input("api::form.form", true),
    "input",
  );
  expect(update({ url: "ftp://x", pick: "other" })).toBe(true);

  // A stored hidden value can break the rules, so responses accept it
  const response = validator(
    schemas,
    schemas.content("api::form.form"),
    "output",
  );
  const base = {
    id: 1,
    documentId: "f",
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
  expect(response({ ...base, kind: "a", url: "ftp://x", pick: "other" })).toBe(
    true,
  );
});

test("a draft create keeps the draft rules of a visible field only", () => {
  const schemas = createSchemas(z, gatedModel(), {
    documentIdPattern: "loose",
  });
  const draft = validator(
    schemas,
    schemas.input("api::form.form", false, true),
    "input",
  );
  expect(draft({ kind: "b", url: "x".repeat(21) })).toBe(false);
  expect(draft({ kind: "b", url: "not-https" })).toBe(true);
  expect(draft({ kind: "a", url: "x".repeat(21) })).toBe(true);
});

test("required relations and media follow api.documents.strictRelations", () => {
  const uid = "api::post.post";
  const models = {
    contentTypes: {
      [uid]: model("post", {
        title: { type: "string" },
        author: {
          type: "relation",
          relation: "manyToOne",
          target: uid,
          required: true,
        },
        cover: { type: "media", multiple: false, required: true },
      }),
    },
    components: {},
  };
  const loose = createSchemas(z, models, { documentIdPattern: "loose" });
  expect(validator(loose, loose.input(uid), "input")({ title: "T" })).toBe(
    true,
  );
  expect(
    validator(loose, loose.input(uid), "input")({ title: "T", author: null }),
  ).toBe(true);

  const strict = createSchemas(z, models, {
    documentIdPattern: "loose",
    strictRelations: true,
  });
  expect(validator(strict, strict.input(uid), "input")({ title: "T" })).toBe(
    false,
  );
  expect(
    validator(
      strict,
      strict.input(uid),
      "input",
    )({ title: "T", author: "abc", cover: 1 }),
  ).toBe(true);
  // Drafts never require them
  expect(
    validator(strict, strict.input(uid, false, true), "input")({ title: "T" }),
  ).toBe(true);
});
