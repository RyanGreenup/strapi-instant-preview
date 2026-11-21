import { expect, test } from "vitest";

import pointer from "../../dist/server/src/spec/pointer.js";
import fuzz from "../fuzz/arbitrary.cjs";

const { parseLocalPointer, pointerToken, resolveLocalPointer } = pointer;

test("splits pointer segments before decoding URI and tilde escapes", () => {
  const document = { "a/b": { "~1": false }, a: { b: true } };
  expect(pointerToken("a~/b")).toBe("a~0~1b");
  expect(parseLocalPointer("#/a%2Fb/%7E01")).toEqual(["a/b", "~1"]);
  expect(resolveLocalPointer(document, "#/a%2Fb/%7E01")).toBe(false);
  expect(resolveLocalPointer(document, "#/a~1b/~01")).toBe(false);
});

test("uses the supplied schema only for the bare hash", () => {
  const document = { "": "empty key" };
  const schema = { "": "other key" };
  expect(parseLocalPointer("#")).toEqual([]);
  expect(resolveLocalPointer(document, "#")).toBe(document);
  expect(resolveLocalPointer(document, "#", schema)).toBe(schema);
  expect(resolveLocalPointer(document, "#/", schema)).toBe("empty key");
});

test.each([
  "",
  "#anchor",
  "/path",
  "other.json#/x",
  "#/%",
  "#/%C3",
  "#/~",
  "#/~2",
  "#/%7E2",
])("treats malformed or nonlocal reference %j as unresolved", (ref) => {
  expect(parseLocalPointer(ref)).toBeUndefined();
  expect(resolveLocalPointer({}, ref)).toBeUndefined();
});

test("resolves own properties only and distinguishes false from missing", () => {
  const document = { schemas: [false] };
  expect(resolveLocalPointer(document, "#/schemas/0")).toBe(false);
  expect(resolveLocalPointer(document, "#/schemas/1")).toBeUndefined();
  expect(resolveLocalPointer(document, "#/schemas/0/child")).toBeUndefined();
  expect(
    resolveLocalPointer(document, "#/schemas/constructor"),
  ).toBeUndefined();
});

test("the fuzz generator reports a dangling reference instead of generating unconstrained values", () => {
  const $ref = "#/components/schemas/Missing";
  expect(() => fuzz.schemaArb({ $ref }, {})).toThrow($ref);
});
