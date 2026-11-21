import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import * as z from "zod/v4";

import builders from "../../dist/server/src/schemas/index.js";
import conversion from "../../dist/server/src/spec/schemas.js";

const { createSchemas, fileUid } = builders;
const { schemaConverter } = conversion;

const schemas = createSchemas(
  z,
  {
    contentTypes: {
      [fileUid]: {
        info: { singularName: "file" },
        attributes: {
          name: { type: "string" },
          formats: { type: "json" },
          focalPoint: { type: "json" },
          provider_metadata: { type: "json" },
        },
      },
    },
    components: {},
  },
  { documentIdPattern: "loose", strictResponseObjects: true },
);

function compile(schema) {
  const components = Object.create(null);
  const convert = schemaConverter(z, schemas.registry, components);
  const converted = convert(schema, "output", "file json unit test");
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  return {
    converted,
    components,
    check: ajv.compile({ ...converted, components: { schemas: components } }),
  };
}

const format = (name, width) => ({
  name: `${name}_cover.png`,
  hash: `${name}_cover`,
  ext: ".png",
  mime: "image/png",
  path: null,
  width,
  height: (width * 3) / 4,
  size: 4.2,
  sizeInBytes: 4200,
  url: `/uploads/${name}_cover.png`,
});

describe("upload file json attributes", () => {
  const { components, check } = compile(schemas.file);
  const file = (fields) =>
    check({ id: 1, documentId: "file", name: "cover.png", ...fields });

  test("formats is a record of size entries that keeps provider extras", () => {
    const formats = {
      thumbnail: format("thumbnail", 245),
      small: { ...format("small", 500), provider: "x" },
    };
    expect(file({ formats }), JSON.stringify(check.errors)).toBe(true);
    expect(file({ formats: null })).toBe(true);
    const { sizeInBytes: _, ...legacy } = format("small", 500);
    expect(
      file({ formats: { small: legacy } }),
      JSON.stringify(check.errors),
    ).toBe(true);
    expect(
      file({ formats: { small: { ...format("small", 500), width: "500" } } }),
    ).toBe(false);
    expect(file({ formats: { small: "small.png" } })).toBe(false);
    expect(components.StrapiFileFormat).toBeDefined();
  });

  test("focalPoint is a nullable point in percent", () => {
    expect(
      file({ focalPoint: { x: 50, y: 0 } }),
      JSON.stringify(check.errors),
    ).toBe(true);
    expect(file({ focalPoint: null })).toBe(true);
    expect(file({ focalPoint: { x: 150, y: 0 } })).toBe(false);
    expect(file({ focalPoint: { x: 50 } })).toBe(false);
    expect(components.StrapiFileFocalPoint).toBeDefined();
  });

  test("provider_metadata stays unconstrained", () => {
    expect(file({ provider_metadata: "anything" })).toBe(true);
    expect(file({ provider_metadata: [1, { a: 2 }] })).toBe(true);
  });
});

describe.each([
  { label: "error", schema: schemas.error, status: 400 },
  { label: "errorFor(400)", schema: schemas.errorFor(400), status: 400 },
  { label: "errorFor(404)", schema: schemas.errorFor(404), status: 404 },
])("$label details", ({ schema, status }) => {
  const { components, check } = compile(schema);
  const body = (details) =>
    check({
      data: null,
      error: {
        status,
        name: "ValidationError",
        message: "Invalid",
        ...(details !== undefined && { details }),
      },
    });

  test("accepts the stable detail forms and missing details", () => {
    const validation = {
      errors: [
        {
          path: ["data", "title"],
          message: "title must be a string",
          name: "ValidationError",
          value: 1,
        },
      ],
    };
    expect(body(validation), JSON.stringify(check.errors)).toBe(true);
    expect(
      body({ key: "sort", path: null, source: "query", param: "sort" }),
      JSON.stringify(check.errors),
    ).toBe(true);
    expect(body({})).toBe(true);
    expect(body(undefined)).toBe(true);
  });

  test("rejects non-object details", () => {
    expect(body("text")).toBe(false);
    expect(body([])).toBe(false);
    expect(body(null)).toBe(false);
  });

  test("names the detail forms", () => {
    expect(components.StrapiErrorDetails).toBeDefined();
    expect(components.StrapiValidationErrorDetails).toBeDefined();
    expect(components.StrapiKeyErrorDetails).toBeDefined();
  });
});

describe("required upload file scalars", () => {
  // Strapi marks these required on plugin::upload.file, and the upload service
  // sets each one on every write path although no validator checks them.
  const models = {
    contentTypes: {
      [fileUid]: {
        info: { singularName: "file" },
        attributes: {
          name: { type: "string", required: true },
          url: { type: "text", required: true },
          caption: { type: "text" },
          related: {
            type: "relation",
            relation: "morphToMany",
            required: true,
          },
        },
      },
    },
    components: {},
  };
  const fileCheck = (config) => {
    const built = createSchemas(z, models, {
      documentIdPattern: "loose",
      strictResponseObjects: true,
      ...config,
    });
    const components = Object.create(null);
    const convert = schemaConverter(z, built.registry, components);
    const converted = convert(built.file, "output", "required file unit test");
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    return ajv.compile({ ...converted, components: { schemas: components } });
  };
  const base = { id: 1, documentId: "file", name: "a.png", url: "/a.png" };

  test("are non-null, while optional ones stay nullable", () => {
    const check = fileCheck({});
    expect(check(base)).toBe(true);
    expect(check({ ...base, caption: null })).toBe(true);
    expect(check({ ...base, name: null })).toBe(false);
    expect(check({ ...base, url: null })).toBe(false);
    // Presence still depends on `fields`, so a required key may be absent.
    expect(check({ id: 1, documentId: "file" })).toBe(true);
  });

  test("stay nullable when publishedResponseRules is off", () => {
    const check = fileCheck({ publishedResponseRules: false });
    expect(check({ ...base, name: null, url: null })).toBe(true);
  });
});
