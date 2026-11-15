import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { Attributes, Components } from "./omitInvisibleFields";

import { omitInvisibleFields } from "./omitInvisibleFields";

type Values = Record<string, unknown>;
interface StrapiFilter {
  handleInvisibleAttributes: (
    data: Values,
    options: {
      schema: { attributes: Attributes };
      initialValues: Values;
      components: Components;
    },
  ) => { data: Values };
}

// Strapi does not export the filter its Save uses, so load it from its build.
// A Strapi upgrade that changes Save's filtering fails these tests.
const contentManagerPackage = createRequire(import.meta.url).resolve(
  "@strapi/content-manager/package.json",
);
const strapiFilterPath = join(
  dirname(contentManagerPackage),
  "dist/admin/pages/EditView/utils/data.mjs",
);

vi.setConfig({ testTimeout: 2000 });

const whenShown: Attributes[string]["conditions"] = {
  visible: { "==": [{ var: "showDetails" }, true] },
};
const attributes: Attributes = {
  title: { type: "string" },
  showDetails: { type: "boolean" },
  details: { type: "string", conditions: whenShown },
  internal: { type: "string", visible: false },
  seo: { type: "component", component: "example.details" },
  items: {
    type: "component",
    component: "example.details",
    repeatable: true,
  },
  blocks: { type: "dynamiczone" },
};
const components: Components = {
  "example.details": {
    attributes: {
      showDetails: { type: "boolean" },
      details: { type: "string", conditions: whenShown },
      note: { type: "string" },
    },
  },
  "example.caption": {
    attributes: {
      body: { type: "string" },
      // The document's title is not in scope inside the component.
      caption: {
        type: "string",
        conditions: { visible: { "==": [{ var: "title" }, "Title"] } },
      },
    },
  },
};
const DETAILS = "example.details";
const initialValues: Values = {
  title: "Title",
  showDetails: true,
  details: "Details",
  internal: "Stored",
  seo: { id: 1, showDetails: true, details: "Seo", note: "Seo note" },
  items: [
    { id: 1, __temp_key__: "a", showDetails: true, details: "A", note: "a" },
    { id: 2, __temp_key__: "b", showDetails: false, details: "B", note: "b" },
  ],
  blocks: [
    {
      id: 1,
      __temp_key__: "x",
      __component: DETAILS,
      showDetails: true,
      details: "X",
    },
    {
      id: 2,
      __temp_key__: "y",
      __component: "example.caption",
      body: "Body",
      caption: "Caption",
    },
  ],
};

const cases: { scenario: string; data: Values }[] = [
  { scenario: "an unchanged document", data: initialValues },
  {
    scenario: "a condition that hides a top-level field",
    data: { ...initialValues, showDetails: false },
  },
  {
    scenario: "a submitted value for a field with visible: false",
    data: { ...initialValues, internal: "Changed" },
  },
  {
    scenario: "fields and components missing from the submitted data",
    data: { title: "Only the title", blocks: initialValues["blocks"] },
  },
  {
    scenario: "a condition that hides a field in a single component",
    data: {
      ...initialValues,
      seo: { id: 1, showDetails: false, details: "Hidden", note: "Kept" },
    },
  },
  {
    scenario: "an emptied component, repeatable component and dynamic zone",
    // oxlint-disable-next-line unicorn/no-null -- The form stores a removed component as null.
    data: { ...initialValues, seo: null, items: [], blocks: undefined },
  },
  {
    scenario: "reordered, edited and new repeatable components",
    data: {
      ...initialValues,
      items: [
        { id: 2, __temp_key__: "b", showDetails: true, details: "Shown" },
        { __temp_key__: "c", showDetails: false, details: "New and hidden" },
        { id: 1, __temp_key__: "a", showDetails: false, details: "Hidden" },
      ],
    },
  },
  {
    scenario: "a repeatable component that reuses a deleted row's key",
    data: {
      ...initialValues,
      // Without an id, it must not inherit the deleted row's other fields.
      items: [{ __temp_key__: "a", showDetails: true }],
    },
  },
  {
    scenario: "new, retyped and reordered dynamic zone items",
    data: {
      ...initialValues,
      blocks: [
        { __temp_key__: "z", __component: DETAILS, details: "New" },
        {
          id: 2,
          __temp_key__: "y",
          __component: DETAILS,
          showDetails: true,
          details: "Retyped",
        },
        {
          id: 1,
          __temp_key__: "x",
          __component: DETAILS,
          showDetails: false,
          details: "Hidden",
        },
      ],
    },
  },
  {
    scenario: "keys outside the schema",
    data: { ...initialValues, extra: "Kept", seo: { id: 1, extra: "Kept" } },
  },
];

describe("omitInvisibleFields", () => {
  it.each(cases)("matches Strapi's Save for $scenario", async ({ data }) => {
    const strapi = await vi.importActual<StrapiFilter>(strapiFilterPath);
    const expected = strapi.handleInvisibleAttributes(data, {
      schema: { attributes },
      initialValues,
      components,
    }).data;

    expect(
      omitInvisibleFields(data, { attributes, initialValues, components }),
    ).toStrictEqual(expected);
  });

  it("removes a hidden field and keeps a visible one", () => {
    // Guard the comparison above against both filters returning nothing.
    expect(
      omitInvisibleFields(
        { title: "Title", showDetails: false, details: "Hidden" },
        {
          attributes: {
            title: { type: "string" },
            showDetails: { type: "boolean" },
            details: { type: "string", conditions: whenShown },
          },
          initialValues: {},
          components,
        },
      ),
    ).toStrictEqual({ title: "Title", showDetails: false });
  });
});
