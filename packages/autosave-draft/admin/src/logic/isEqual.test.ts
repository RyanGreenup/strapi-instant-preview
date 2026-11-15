import { describe, expect, it, vi } from "vitest";

import { changedKeys, isEqual } from "./isEqual";

vi.setConfig({ testTimeout: 1000 });

describe("isEqual", () => {
  it("compares primitives", () => {
    expect(isEqual(1, 1)).toBe(true);
    expect(isEqual("a", "b")).toBe(false);
    expect(isEqual(0, false)).toBe(false);
    expect(isEqual("", null)).toBe(false);
  });

  it("treats null, undefined and a missing key as the same", () => {
    const missingValue = undefined;

    expect(isEqual(null, missingValue)).toBe(true);
    expect(isEqual({ a: null }, { a: undefined })).toBe(true);
    expect(isEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
    expect(isEqual({ a: 1, b: null }, { a: 1 })).toBe(true);
  });

  it("compares nested objects and arrays", () => {
    expect(
      isEqual({ a: [{ b: 1 }, { c: [2] }] }, { a: [{ b: 1 }, { c: [2] }] }),
    ).toBe(true);
    expect(isEqual({ a: [{ b: 1 }] }, { a: [{ b: 2 }] })).toBe(false);
  });

  it("is sensitive to array order and length", () => {
    expect(isEqual([1, 2], [2, 1])).toBe(false);
    expect(isEqual([1], [1, undefined])).toBe(false);
  });

  it("does not confuse arrays with objects", () => {
    expect(isEqual([], {})).toBe(false);
  });
});

describe("changedKeys", () => {
  it("returns nothing for equal values", () => {
    expect(changedKeys({ a: 1, b: [1] }, { a: 1, b: [1] })).toStrictEqual([]);
  });

  it("returns the top-level keys that differ", () => {
    expect(
      changedKeys({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } }),
    ).toStrictEqual(["b"]);
  });

  it("sees keys that exist on one side only", () => {
    expect(new Set(changedKeys({ a: 1 }, { b: 2 }))).toStrictEqual(
      new Set(["a", "b"]),
    );
  });

  it("does not report null against undefined", () => {
    expect(changedKeys({ a: null }, {})).toStrictEqual([]);
  });
});
