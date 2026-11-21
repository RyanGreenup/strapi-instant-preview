import { expect, test } from "vitest";

import {
  exportedParameters,
  optionsIndexes,
} from "../../dist/server/src/tooling/client.js";

test("splits only top-level commas in a signature", () => {
  const source = [
    "export const find = (params?: Record<string, A | B>,",
    "    filter?: (a: { x: 1, y: 2 }, b: string) => void,",
    "    label?: 'a,b' | \"c)d\" | `e(f`, options?: CallOptions) =>",
    "  execute({ url: '/x', method: 'GET', options });",
    "export const getFindUrl = (id: string,",
    "    params?: Params,) => {",
    "  return `/x/` + id;",
    "}",
  ].join("\n");
  expect(exportedParameters(source)).toEqual(
    new Map([
      [
        "find",
        [
          "params?: Record<string, A | B>",
          "filter?: (a: { x: 1, y: 2 }, b: string) => void",
          "label?: 'a,b' | \"c)d\" | `e(f`",
          "options?: CallOptions",
        ],
      ],
      ["getFindUrl", ["id: string", "params?: Params"]],
    ]),
  );
});

test("keeps an escaped quote inside a string literal type", () => {
  const source =
    "export const f = (a?: 'it\\'s, fine', options?: CallOptions) => 1;";
  expect(exportedParameters(source).get("f")).toEqual([
    "a?: 'it\\'s, fine'",
    "options?: CallOptions",
  ]);
});

test("finds the options position, and refuses an operation without one", () => {
  const source = [
    "export const list = (options?: CallOptions) => 1;",
    "export const one = (id: string, params?: P, options?: CallOptions) => 1;",
    "export const bare = (id: string) => 1;",
  ].join("\n");
  expect(optionsIndexes(source, ["list", "one"])).toEqual(
    new Map([
      ["list", 0],
      ["one", 2],
    ]),
  );
  expect(() => optionsIndexes(source, ["bare"])).toThrow(
    "not `options?: CallOptions`",
  );
  expect(() => optionsIndexes(source, ["missing"])).toThrow(
    "has no function missing",
  );
});
