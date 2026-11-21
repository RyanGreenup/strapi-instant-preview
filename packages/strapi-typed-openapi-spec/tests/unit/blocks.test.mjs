import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import * as z from "zod/v4";

import configModule from "../../dist/server/src/config/index.js";
import builders from "../../dist/server/src/schemas/index.js";
import conversion from "../../dist/server/src/spec/schemas.js";

const { createSchemas } = builders;
const { schemaConverter } = conversion;

const imageNode = { type: "image", children: [] };
const snapshot = {
  name: "cover.png",
  url: "/uploads/cover.png",
  width: 640,
  height: 480,
  hash: "cover",
  ext: ".png",
  mime: "image/png",
  size: 12,
  provider: "local",
  createdAt: "May 7, 2025",
  updatedAt: "2025-05-07 10:45:12",
  placeholder: { color: "#fff" },
};

const uid = "api::article.article";
const schemas = createSchemas(
  z,
  {
    contentTypes: {
      [uid]: {
        info: { singularName: "article" },
        attributes: { body: { type: "blocks" } },
      },
    },
    components: {},
  },
  { documentIdPattern: "loose", strictResponseObjects: true },
);

const modes = [
  { io: "input", schema: schemas.input(uid), fields: {} },
  {
    io: "output",
    schema: schemas.document(uid),
    fields: { id: 1, documentId: "article" },
  },
];

describe.each(modes)("emitted blocks $io schema", ({ io, schema, fields }) => {
  const components = Object.create(null);
  const convert = schemaConverter(z, schemas.registry, components);
  const converted = convert(schema, io, "blocks unit test");
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const checkDocument = ajv.compile({
    ...converted,
    components: { schemas: components },
  });
  const validate = (node) => checkDocument({ ...fields, body: [node] });

  test("requires an image snapshot on writes but allows omission in responses", () => {
    expect(validate(imageNode), JSON.stringify(checkDocument.errors)).toBe(
      io === "output",
    );
    expect(validate({ ...imageNode, image: null })).toBe(false);
    expect(validate({ ...imageNode, image: { url: snapshot.url } })).toBe(
      false,
    );
    expect(validate({ type: "image" })).toBe(false);
  });

  test("accepts non-ISO string timestamps and snapshot extension fields", () => {
    expect(
      validate({ ...imageNode, image: snapshot }),
      JSON.stringify(checkDocument.errors),
    ).toBe(true);
    for (const field of ["createdAt", "updatedAt"]) {
      expect(
        validate({ ...imageNode, image: { ...snapshot, [field]: 123 } }),
        field,
      ).toBe(false);
    }
  });

  test("types the snapshot formats and focal point but keeps them open", () => {
    const format = {
      name: "thumbnail_cover.png",
      hash: "thumbnail_cover",
      ext: ".png",
      mime: "image/png",
      path: null,
      width: 245,
      height: 184,
      size: 4.2,
      sizeInBytes: 4200,
      url: "/uploads/thumbnail_cover.png",
      extra: 1,
    };
    const typed = {
      ...snapshot,
      formats: { thumbnail: format },
      focalPoint: { x: 25, y: 75 },
    };
    expect(
      validate({ ...imageNode, image: typed }),
      JSON.stringify(checkDocument.errors),
    ).toBe(true);
    expect(
      validate({
        ...imageNode,
        image: { ...typed, formats: null, focalPoint: null },
      }),
    ).toBe(true);
    expect(
      validate({
        ...imageNode,
        image: {
          ...typed,
          formats: { thumbnail: { ...format, width: "245" } },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...imageNode,
        image: { ...typed, focalPoint: { x: 150, y: 0 } },
      }),
    ).toBe(false);
  });

  test("restricts code children to text without closing nodes to editor metadata", () => {
    const text = { type: "text", text: "", fontSize: 14 };
    const link = { type: "link", url: "/docs", children: [text] };
    const code = { type: "code", language: "js", editorPlugin: true };
    expect(
      validate({ ...code, children: [text] }),
      JSON.stringify(checkDocument.errors),
    ).toBe(true);
    expect(validate({ ...code, children: [link] })).toBe(false);
    expect(
      validate({ type: "paragraph", children: [link] }),
      JSON.stringify(checkDocument.errors),
    ).toBe(true);
  });
});

describe("declared blocksProperties", () => {
  const blocksProperties = {
    paragraph: { fontSize: { enum: [14, 16, 18] } },
    text: { superscript: "boolean", subscript: "boolean" },
    heading: { anchor: "string" },
  };
  const declared = createSchemas(
    z,
    {
      contentTypes: {
        [uid]: {
          info: { singularName: "article" },
          attributes: { body: { type: "blocks" } },
        },
      },
      components: {},
    },
    {
      documentIdPattern: "loose",
      strictResponseObjects: true,
      blocksProperties,
    },
  );
  const compile = (schema, io, registry = declared.registry) => {
    const components = Object.create(null);
    const convert = schemaConverter(z, registry, components);
    const converted = convert(schema, io, "declared blocks unit test");
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    return {
      components,
      check: ajv.compile({ ...converted, components: { schemas: components } }),
    };
  };
  const paragraph = (extra = {}, textExtra = {}) => ({
    type: "paragraph",
    children: [{ type: "text", text: "x", ...textExtra }],
    ...extra,
  });

  test.each([
    ["input", () => declared.input(uid), {}],
    ["output", () => declared.document(uid), { id: 1, documentId: "a" }],
  ])(
    "%s schema types declared keys and keeps others open",
    (io, schema, fields) => {
      const { check } = compile(schema(), io);
      const valid = (node) => check({ ...fields, body: [node] });
      expect(valid(paragraph())).toBe(true);
      expect(valid(paragraph({ fontSize: 16 }))).toBe(true);
      expect(valid(paragraph({ fontSize: 15 }))).toBe(false);
      expect(valid(paragraph({ fontSize: "16" }))).toBe(false);
      expect(valid(paragraph({}, { superscript: true }))).toBe(true);
      expect(valid(paragraph({}, { superscript: "yes" }))).toBe(false);
      expect(
        valid({
          type: "heading",
          level: 2,
          anchor: "intro",
          children: [{ type: "text", text: "x" }],
        }),
      ).toBe(true);
      // Undeclared keys stay allowed, since Strapi stores them.
      expect(
        valid(paragraph({ textAlign: "center" }, { highlight: true })),
      ).toBe(true);
    },
  );

  test("emits each declared key as optional with a description", () => {
    const { components } = compile(declared.document(uid), "output");
    const node = components.StrapiBlocksNode.oneOf.find(
      (variant) => variant.properties?.type?.const === "paragraph",
    );
    expect(node.properties.fontSize).toMatchObject({
      enum: [14, 16, 18],
      description: expect.stringContaining("blocksProperties"),
    });
    expect(node.required).not.toContain("fontSize");
  });

  test("leaves nodes unchanged without a declaration", () => {
    const { components } = compile(
      schemas.document(uid),
      "output",
      schemas.registry,
    );
    const node = components.StrapiBlocksNode.oneOf.find(
      (variant) => variant.properties?.type?.const === "paragraph",
    );
    expect(Object.keys(node.properties).sort()).toEqual(["children", "type"]);
  });
});

describe("blocksProperties config", () => {
  const check = (blocksProperties) => () =>
    configModule.validator({ blocksProperties });

  test("accepts primitive types and nonempty enums", () => {
    expect(
      check({
        paragraph: { fontSize: "number" },
        text: { superscript: "boolean", tone: { enum: ["muted", 1, true] } },
        "list-item": { checked: "boolean" },
      }),
    ).not.toThrow();
  });

  test("rejects keys that Strapi defines, unknown nodes and unknown types", () => {
    expect(check({ text: { bold: "string" } })).toThrow(
      /Strapi already defines text\.bold/,
    );
    expect(check({ paragraph: { children: "string" } })).toThrow(
      /paragraph\.children/,
    );
    expect(check({ callout: { tone: "string" } })).toThrow(/blocksProperties/);
    expect(check({ paragraph: { fontSize: "float" } })).toThrow(/fontSize/);
    expect(check({ paragraph: { fontSize: { enum: [] } } })).toThrow(
      /fontSize/,
    );
  });
});
