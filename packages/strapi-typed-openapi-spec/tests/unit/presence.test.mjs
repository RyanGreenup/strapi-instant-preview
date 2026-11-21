import { expect, test } from "vitest";
import * as z from "zod/v4";

import schemaModule from "../../dist/server/src/schemas/index.js";
import presence from "../../dist/server/src/schemas/presence.js";

const { parsePresence } = presence;
const { createSchemas } = schemaModule;

const models = {
  contentTypes: {
    "api::article.article": {
      kind: "collectionType",
      info: { singularName: "article", pluralName: "articles" },
      options: { draftAndPublish: true },
      attributes: {
        title: { type: "string", required: true },
        summary: { type: "text" },
        teaser: {
          type: "string",
          required: true,
          conditions: { visible: { "==": [{ var: "title" }, "x"] } },
        },
        createdAt: { type: "datetime" },
        updatedAt: { type: "datetime" },
        publishedAt: { type: "datetime" },
        author: {
          type: "relation",
          relation: "manyToOne",
          target: "api::person.person",
        },
        tags: {
          type: "relation",
          relation: "manyToMany",
          target: "api::person.person",
        },
        lead: {
          type: "relation",
          relation: "manyToOne",
          target: "api::person.person",
          useJoinTable: false,
        },
        cover: { type: "media", multiple: false },
        seo: { type: "component", component: "shared.seo", repeatable: false },
        blocks: {
          type: "dynamiczone",
          components: ["shared.seo", "shared.quote"],
        },
      },
    },
    "api::person.person": {
      kind: "collectionType",
      info: { singularName: "person", pluralName: "people" },
      options: { draftAndPublish: false },
      attributes: {
        name: { type: "string", required: true },
        photo: { type: "media", multiple: false },
      },
    },
    "plugin::upload.file": {
      kind: "collectionType",
      info: { singularName: "file", pluralName: "files" },
      options: {},
      attributes: {
        name: { type: "string", required: true },
        url: { type: "string", required: true },
      },
    },
  },
  components: {
    "shared.seo": {
      info: {},
      attributes: {
        metaTitle: { type: "string", required: true },
        image: { type: "media", multiple: false },
      },
    },
    "shared.quote": { info: {}, attributes: { text: { type: "text" } } },
  },
  // As strapi.db.metadata reports it: `lead` uses a join column (useJoinTable: false).
  relationStorage: (owner, key) =>
    owner === "api::article.article" && key === "lead"
      ? "join-column"
      : "join-table",
};

const uid = "api::article.article";
const plan = (query) => parsePresence(models, uid, query);
const keys = (presence) => [...presence.populate.keys()].sort();

test("reads populate shortcuts, lists, dot paths and objects", () => {
  expect(keys(plan({}).root)).toEqual([]);
  expect(keys(plan({ populate: "*" }).root)).toEqual([
    "author",
    "blocks",
    "cover",
    "lead",
    "seo",
    "tags",
  ]);
  expect(keys(plan({ populate: "author,cover" }).root)).toEqual([
    "author",
    "cover",
  ]);
  expect(keys(plan({ populate: ["seo"] }).root)).toEqual(["seo"]);
  const dotted = plan({ populate: "author.photo" }).root.populate.get("author");
  expect(keys(dotted.plan)).toEqual(["photo"]);
  const nested = plan({
    populate: {
      author: { populate: "*", fields: ["name"] },
      tags: { count: "true" },
    },
  }).root;
  expect(keys(nested.populate.get("author").plan)).toEqual(["photo"]);
  expect([...nested.populate.get("author").plan.fields]).toEqual(["name"]);
  expect(nested.populate.get("tags")).toEqual({
    kind: "count",
    target: "api::person.person",
  });
});

test("reads dynamic zone fragments and shared populate", () => {
  const fragments = plan({
    populate: { blocks: { on: { "shared.seo": { populate: "image" } } } },
  }).root.populate.get("blocks");
  expect(fragments.kind).toBe("zone");
  expect(keys(fragments.on.get("shared.seo"))).toEqual(["image"]);
  expect(keys(fragments.on.get("shared.quote"))).toEqual([]);
  // Strapi ignores `count` on a dynamic zone and sends the entries.
  const counted = plan({
    populate: { blocks: { count: "true" } },
  }).root.populate.get("blocks");
  expect(counted.kind).toBe("zone");
  expect(keys(counted.on.get("shared.seo"))).toEqual([]);
  const shared = plan({
    populate: { blocks: { populate: "*" } },
  }).root.populate.get("blocks");
  expect(keys(shared.on.get("shared.seo"))).toEqual(["image"]);
});

test("reads fields, status and both pagination styles", () => {
  expect(plan({ fields: "title,summary" }).root.fields).toEqual(
    new Set(["title", "summary"]),
  );
  expect(plan({ fields: "*" }).root.fields).toBeUndefined();
  expect(plan({}).status).toBe("published");
  expect(plan({ status: "draft" }).status).toBe("draft");
  expect(plan({ status: "published" }).status).toBe("published");
  expect(plan({}).pagination).toEqual({ style: "page", withCount: true });
  expect(plan({ pagination: { start: "0", limit: "2" } }).pagination).toEqual({
    style: "offset",
    withCount: true,
  });
  expect(
    plan({ pagination: { page: "1", withCount: "false" } }).pagination,
  ).toEqual({ style: "page", withCount: false });
  expect(plan({ pagination: { withCount: "0" } }).pagination.withCount).toBe(
    false,
  );
  expect(
    parsePresence(models, uid, {}, { write: false, withCount: false })
      .pagination.withCount,
  ).toBe(false);
});

test("returns undefined for shapes it does not model", () => {
  for (const query of [
    { populate: { nope: true } },
    { populate: { cover: { count: true } } },
    { populate: { author: { on: {} } } },
    { populate: { author: { bogus: 1 } } },
    { fields: ["author"] },
    { fields: ["nope"] },
    { status: "archived" },
    { pagination: { page: "1", start: "0" } },
    { pagination: { withCount: "maybe" } },
    "populate=*",
  ])
    expect(plan(query), JSON.stringify(query)).toBeUndefined();
  expect(
    parsePresence(models, "api::missing.missing", {}, { write: false }),
  ).toBeUndefined();
});

const schemas = createSchemas(z, models, {
  documentIdPattern: "loose",
  strictResponseObjects: true,
});
// Every relation target is readable unless a test passes its own access.
const everyone = { readable: new Set(["api::person.person"]) };
// Pass `undefined` explicitly for unknown permissions.
const response = (query, list = false, ...access) =>
  schemas.queryResponse(
    uid,
    list,
    plan(query),
    access.length ? access[0] : everyone,
  );
const article = (extra = {}) => ({
  id: 1,
  documentId: "a1",
  title: "T",
  summary: null,
  teaser: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});
const ok = (schema, data, meta = {}) =>
  schema.safeParse({ data, meta }).success;

test("requires sent scalars and populated keys, and rejects unpopulated ones", () => {
  expect(ok(response({}), article())).toBe(true);
  const { summary: _, ...noSummary } = article();
  expect(ok(response({}), noSummary)).toBe(false);
  expect(
    ok(response({ fields: ["title"] }), {
      id: 1,
      documentId: "a1",
      title: "T",
    }),
  ).toBe(true);
  expect(ok(response({}), article({ author: null }))).toBe(false);
  expect(ok(response({ populate: "author" }), article())).toBe(false);
  expect(ok(response({ populate: "author" }), article({ author: null }))).toBe(
    true,
  );
  expect(
    ok(
      response({ populate: "author" }),
      article({
        author: {
          id: 2,
          documentId: "p",
          name: "N",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          publishedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ),
  ).toBe(true);
  expect(
    ok(
      response({ populate: { tags: { count: true } } }),
      article({ tags: { count: 3 } }),
    ),
  ).toBe(true);
  expect(
    ok(
      response({ populate: { tags: { count: true } } }),
      article({ tags: [] }),
    ),
  ).toBe(false);
});

test("a count request follows the relation's database storage", () => {
  expect(
    plan({ populate: { lead: { count: true } } }).root.populate.get("lead"),
  ).toMatchObject({ kind: "nested", target: "api::person.person" });
  const person = {
    id: 2,
    documentId: "p",
    name: "N",
    photo: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
  delete person.photo;
  const counted = response({ populate: { lead: { count: true } } });
  expect(ok(counted, article({ lead: person }))).toBe(true);
  expect(ok(counted, article({ lead: null }))).toBe(true);
  expect(ok(counted, article({ lead: { count: 1 } }))).toBe(false);

  // Unknown storage: either shape passes, neither is required.
  const { relationStorage: _, ...unknownModels } = models;
  const unknown = createSchemas(z, unknownModels, {
    documentIdPattern: "loose",
    strictResponseObjects: true,
  });
  const unknownPlan = parsePresence(unknownModels, uid, {
    populate: { tags: { count: true } },
  });
  expect(unknownPlan.root.populate.get("tags").kind).toBe("count-or-nested");
  const loose = unknown.queryResponse(uid, false, unknownPlan, everyone);
  expect(ok(loose, article({ tags: { count: 2 } }))).toBe(true);
  expect(ok(loose, article({ tags: [person] }))).toBe(true);
  expect(ok(loose, article({ tags: { count: -1 } }))).toBe(false);
  expect(ok(loose, article({ tags: { count: 1.5 } }))).toBe(false);

  // The shared schema keeps the count branch only where Strapi can send it.
  expect(schemas.relationCount(uid, "lead")).toBe("no");
  expect(schemas.relationCount(uid, "tags")).toBe("yes");
  expect(unknown.relationCount(uid, "tags")).toBe("unknown");
});

test("a populated relation is required only when its permission is known", () => {
  const populated = { populate: "author" };
  // Unknown permissions: the key may be missing, but a wrong value still fails.
  expect(ok(response(populated, false, undefined), article())).toBe(true);
  expect(
    ok(response(populated, false, undefined), article({ author: "x" })),
  ).toBe(false);
  // Readable: required. Not readable: Strapi removes it, so it must be absent.
  expect(ok(response(populated), article())).toBe(false);
  const blocked = { readable: new Set() };
  expect(ok(response(populated, false, blocked), article())).toBe(true);
  expect(
    ok(response(populated, false, blocked), article({ author: null })),
  ).toBe(false);
  expect(
    plan({ populate: { author: { populate: "photo" }, cover: true } }),
  ).toBeDefined();
});

test("makes required fields and publishedAt non-null only on published responses", () => {
  expect(ok(response({}), article({ title: null }))).toBe(false);
  expect(ok(response({}), article({ publishedAt: null }))).toBe(false);
  expect(
    ok(
      response({ status: "draft" }),
      article({ title: null, publishedAt: null }),
    ),
  ).toBe(true);
  // A draft read returns the draft version: a timestamp is wrong, and a
  // publishedAt left out by `fields` stays optional.
  expect(ok(response({ status: "draft" }), article({ title: null }))).toBe(
    false,
  );
  expect(
    ok(response({ status: "draft", fields: ["title"] }), {
      id: 1,
      documentId: "a1",
      title: "T",
    }),
  ).toBe(true);
  // A field hidden by conditions.visible is stored as null even when required.
  expect(ok(response({}), article({ teaser: null }))).toBe(true);
});

test("dynamic zones follow on fragments", () => {
  const zone = response({
    populate: { blocks: { on: { "shared.seo": { populate: "image" } } } },
  });
  const quote = { id: 3, __component: "shared.quote", text: null };
  expect(
    ok(
      zone,
      article({
        blocks: [
          quote,
          { id: 4, __component: "shared.seo", metaTitle: "M", image: null },
        ],
      }),
    ),
  ).toBe(true);
  expect(
    ok(
      zone,
      article({
        blocks: [{ id: 4, __component: "shared.seo", metaTitle: "M" }],
      }),
    ),
  ).toBe(false);
});

test("list meta follows the pagination style and withCount", () => {
  const list = (query) => (meta) =>
    ok(response(query, true), [article()], meta);
  expect(
    list({})({ pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 } }),
  ).toBe(true);
  expect(list({})({ pagination: { page: 1, pageSize: 25 } })).toBe(false);
  expect(
    list({ pagination: { withCount: "false" } })({
      pagination: { page: 1, pageSize: 25 },
    }),
  ).toBe(true);
  expect(
    list({ pagination: { start: "0", limit: "5" } })({
      pagination: { start: 0, limit: 5, total: 1 },
    }),
  ).toBe(true);
  expect(
    list({ pagination: { start: "0", limit: "5" } })({
      pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 },
    }),
  ).toBe(false);
});
