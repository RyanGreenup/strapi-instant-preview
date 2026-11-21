import { expect, test } from "vitest";

import mutations from "../accuracy/mutations.cjs";

const { responseMutations } = mutations;
const integer = { type: "integer" };
const string = { type: "string" };
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const array = (items) => ({ type: "array", items });
const object = (properties, required = [], closed = true) => ({
  type: "object",
  properties,
  required,
  additionalProperties: !closed,
});
const tagged = (tag) => ({ type: "string", const: tag });
const docs = (schemas) => ({ components: { schemas } });

test("samples typed wire mutations through repeated population references without changing the source", () => {
  const schema = ref("Entry~1Document");
  const document = docs({
    "Entry/Document": object(
      {
        id: integer,
        documentId: string,
        rating: { type: "number" },
        featured: { type: "boolean" },
        publishedAt: {
          anyOf: [{ type: "string", format: "date-time" }, { type: "null" }],
        },
        related: {
          anyOf: [array(schema), object({ count: integer }, ["count"])],
        },
      },
      ["id", "documentId"],
    ),
  });
  const body = {
    id: 1,
    documentId: "root",
    publishedAt: "2026-11-21T00:00:00Z",
    rating: 5,
    featured: true,
    related: [
      { id: 2, documentId: "leaf", related: [{ id: 3, documentId: "nested" }] },
    ],
  };
  const original = structuredClone(body);
  const result = [...responseMutations(body, document, schema, 100)];
  expect(result).toContainEqual({
    kind: "array-to-object",
    body: { ...body, related: {} },
  });
  expect(result).toContainEqual({
    kind: "boolean-to-string",
    body: { ...body, featured: "true" },
  });
  expect(result).toContainEqual({
    kind: "number-to-string",
    body: { ...body, rating: "5" },
  });
  expect(result).toContainEqual({
    kind: "invalid-date",
    body: { ...body, publishedAt: "not-a-date" },
  });
  expect(result.filter(({ kind }) => kind === "integer-to-float")).toHaveLength(
    3,
  );
  expect(result.filter(({ kind }) => kind === "removed-id")).toHaveLength(3);
  expect(
    result.filter(({ kind }) => kind === "removed-documentId"),
  ).toHaveLength(3);
  expect(result).toContainEqual({
    kind: "integer-to-float",
    body: {
      ...body,
      related: [
        {
          id: 2,
          documentId: "leaf",
          related: [{ id: 0.5, documentId: "nested" }],
        },
      ],
    },
  });
  result.find(({ kind }) => kind === "invalid-date").body.related[0].id = 99;
  expect(body).toEqual(original);
});

test("excludes arbitrary JSON and permitted extras but still probes dynamic zones and typed block fields", () => {
  const schema = object({
    payload: { anyOf: [{}, { type: "null" }] },
    blocks: array(ref("StrapiBlocksNode")),
    morph: object({ __type: string, title: string }, ["__type"], false),
    sections: array({ oneOf: [ref("Note"), ref("Quote")] }),
  });
  const document = docs({
    StrapiBlocksNode: object({
      type: tagged("paragraph"),
      children: array(object({ text: string, rel: string }, ["text"])),
    }),
    Note: object({ __component: tagged("content.note"), text: string }, [
      "__component",
    ]),
    Quote: object({ __component: tagged("content.quote"), text: {} }, [
      "__component",
    ]),
  });
  const body = {
    payload: { id: 12, createdAt: "2026-11-21T00:00:00Z", items: [true] },
    blocks: [
      { type: "paragraph", children: [{ text: "hello", rel: "custom" }] },
    ],
    morph: {
      __type: "api::entry.entry",
      title: "title",
      arbitrary: { id: 123 },
    },
    sections: [{ __component: "content.note", text: "text" }],
  };
  const result = [
    ...responseMutations(body, document, schema, 100, { document, schema }),
  ];
  expect(result).toContainEqual({
    kind: "invalid-component",
    body: {
      ...body,
      sections: [
        { __component: "__accuracy_invalid_component__", text: "text" },
      ],
    },
  });
  expect(result).toContainEqual({
    kind: "string-to-number",
    body: {
      ...body,
      blocks: [{ type: "paragraph", children: [{ text: 1, rel: "custom" }] }],
    },
  });
  expect(result).toContainEqual({
    kind: "string-to-number",
    body: { ...body, sections: [{ __component: "content.note", text: 1 }] },
  });
  expect(
    result.flatMap(({ body: changed }) =>
      typeof changed === "object" ? [changed.payload] : [],
    ),
  ).toEqual(Array(result.length - 1).fill(body.payload));
  for (const { body: changed } of result) {
    if (typeof changed === "object" && typeof changed.morph === "object") {
      expect(changed.morph.arbitrary).toEqual(body.morph.arbitrary);
    }
    const child = changed.blocks?.[0]?.children?.[0];
    if (typeof child === "object") expect(child.rel).toBe("custom");
  }
  expect(result.filter(({ kind }) => kind === "unknown-key")).toHaveLength(2);
});

test("requires both contracts to close objects before adding a key", () => {
  const document = docs({});
  const schema = object({ entry: object({ title: string }) });
  const comparison = {
    document,
    schema: object({ entry: object({ title: string }, [], false) }),
  };
  const body = { entry: { title: "typed" } };
  expect(
    [...responseMutations(body, document, schema, 60, comparison)].filter(
      ({ kind }) => kind === "unknown-key",
    ),
  ).toEqual([
    { kind: "unknown-key", body: { ...body, __accuracy_unknown__: true } },
  ]);
  expect(
    [...responseMutations(body, document, schema)].some(
      ({ kind }) => kind === "unknown-key",
    ),
  ).toBe(false);
});

test("caps the repeatable sample independently of object key insertion order", () => {
  const schema = object({
    data: array(object({ id: integer, title: string }, ["id"])),
  });
  const document = docs({});
  const data = Array.from({ length: 100 }, (_, i) => ({
    title: `entry ${i}`,
    id: i + 1,
  }));
  const sample = [...responseMutations({ data }, document, schema)];
  const reordered = data.map(({ id, title }) => ({ id, title }));
  expect(sample).toHaveLength(60);
  expect([...responseMutations({ data: reordered }, document, schema)]).toEqual(
    sample,
  );
  expect([...responseMutations({ data }, document, schema, 0)]).toEqual([]);
});
