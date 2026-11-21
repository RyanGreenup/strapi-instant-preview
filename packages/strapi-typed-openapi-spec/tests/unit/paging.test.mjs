import Ajv2020 from "ajv/dist/2020.js";
import { expect, test } from "vitest";
import * as z from "zod/v4";

import modelFields from "../../dist/server/src/spec/model-fields.js";
import paging from "../../dist/server/src/spec/paging.js";
import schemas from "../../dist/server/src/spec/schemas.js";

const { createModelFields } = modelFields;
const { createPaging } = paging;
const { schemaConverter } = schemas;

function validateInput(schema) {
  const components = Object.create(null);
  const convert = schemaConverter(z, z.registry(), components);
  const input = convert(schema, "input", "query parameter");
  return new Ajv2020({ strict: false }).compile({
    ...input,
    components: { schemas: components },
  });
}

test("pagination supports partial page or offset inputs, but cannot mix them", () => {
  const { pagination } = createPaging(
    z,
    createModelFields({ contentTypes: {}, components: {} }),
  );
  const validate = validateInput(pagination);
  for (const value of [
    {},
    { page: 1 },
    { pageSize: "20" },
    { start: 0 },
    { limit: -1 },
    { limit: "-1" },
    { page: 2, pageSize: 25, withCount: "false" },
    { start: "20", limit: 10, withCount: false },
    { withCount: "0" },
    { withCount: "f" },
    { withCount: "1" },
    { withCount: "t" },
    { withCount: 1 },
  ]) {
    expect(validate(value), JSON.stringify(value)).toBe(true);
  }
  for (const value of [
    { page: 1, start: 0 },
    { page: 1, limit: 1 },
    { pageSize: 25, start: 2 },
    { pageSize: 25, limit: -1 },
    { page: 1.5 },
    { start: "zero" },
    { withCount: "no" },
    [],
    "1",
  ]) {
    expect(validate(value), JSON.stringify(value)).toBe(false);
  }
});

test("sort supports comma-separated paths and nested ordering without accepting unknown or restricted fields", () => {
  const pageUid = "api::page.page";
  const categoryUid = "api::category.category";
  const { sort } = createPaging(
    z,
    createModelFields({
      contentTypes: {
        [pageUid]: {
          info: {},
          options: {
            draftAndPublish: true,
            privateAttributes: ["internalName"],
          },
          attributes: {
            title: { type: "string" },
            parent: {
              type: "relation",
              relation: "manyToOne",
              target: pageUid,
            },
            category: {
              type: "relation",
              relation: "manyToOne",
              target: categoryUid,
            },
            cover: { type: "media" },
            seo: { type: "component", component: "shared.seo" },
            links: {
              type: "relation",
              relation: "morphToMany",
              target: categoryUid,
            },
            missing: { type: "component", component: "shared.missing" },
            blocks: { type: "dynamiczone" },
            password: { type: "password" },
            secret: { type: "string", private: true },
            internalName: { type: "string" },
            globallyPrivate: { type: "string" },
          },
        },
        [categoryUid]: {
          info: {},
          attributes: {
            label: { type: "string" },
            page: { type: "relation", relation: "manyToOne", target: pageUid },
          },
        },
        "plugin::upload.file": {
          info: {},
          attributes: { name: { type: "string" } },
        },
      },
      components: {
        "shared.seo": { info: {}, attributes: { summary: { type: "string" } } },
      },
      privateAttributes: ["globallyPrivate"],
    }),
  );
  const validate = validateInput(sort(pageUid));
  for (const value of [
    "title:desc",
    "title: ASC, parent.title:dEsC, documentId, id,",
    `${"parent.".repeat(9)}title`,
    "category.page.category.label:asc",
    "seo.summary",
    "cover.name",
    ["title:asc, documentId", "parent.title:DESC"],
    {
      title: " asc ",
      parent: { title: "DESC" },
      seo: { summary: "asc" },
      cover: { name: "DESC" },
    },
    [{ parent: { category: { label: "desc" } } }, { title: "asc" }],
    "",
    [],
  ]) {
    expect(validate(value), JSON.stringify(value)).toBe(true);
  }
  for (const value of [
    "title:up",
    "unknown:desc",
    "parent",
    "parent.unknown",
    "title.label",
    "category.title",
    "category.status",
    "seo.documentId",
    "secret",
    "internalName",
    "globallyPrivate",
    "password",
    "blocks.title",
    "status",
    "parent.title: desc",
    "links",
    "links.label",
    "missing",
    "missing.id",
    ["title", { title: "asc" }],
    { title: "up" },
    { parent: { unknown: "asc" } },
    { parent: "desc" },
    { parent: [{ title: "desc" }] },
    { secret: "asc" },
  ]) {
    expect(validate(value), JSON.stringify(value)).toBe(false);
  }
});

test("unknown models have no sortable fields, including synthetic IDs", () => {
  const { sort, populateSort } = createPaging(
    z,
    createModelFields({ contentTypes: {}, components: {} }),
  );
  for (const schema of [
    sort("api::missing.missing"),
    populateSort("api::missing.missing"),
  ]) {
    const validate = validateInput(schema);
    expect(validate({})).toBe(true);
    expect(validate("id")).toBe(false);
    expect(validate({ documentId: "asc" })).toBe(false);
  }
});
