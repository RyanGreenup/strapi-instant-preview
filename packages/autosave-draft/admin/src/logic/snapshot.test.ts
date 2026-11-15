import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSnapshot,
  readSnapshot,
  snapshotKey,
  writeSnapshot,
} from "./snapshot";

vi.setConfig({ testTimeout: 1000 });

type SnapshotStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const createStorage = (): SnapshotStorage => {
  const map = new Map<string, string>();

  return {
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string): void => {
      map.delete(key);
    },
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
  };
};

describe("snapshot", () => {
  // Each test has fresh storage from beforeEach.
  // eslint-disable-next-line init-declarations
  let storage: SnapshotStorage;

  beforeEach(() => {
    storage = createStorage();
    vi.stubGlobal("sessionStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds one key per model, document and locale", () => {
    const missingLocale = undefined;

    expect(snapshotKey("api::a.a", "doc1", "en")).not.toBe(
      snapshotKey("api::a.a", "doc1", "fr"),
    );
    expect(snapshotKey("api::a.a", "doc1", null)).toBe(
      snapshotKey("api::a.a", "doc1", missingLocale),
    );
    expect(snapshotKey("api::a.a", undefined, "en")).not.toBe(
      snapshotKey("api::a.a", "doc1", "en"),
    );
  });

  it("reads back what it wrote", () => {
    const key = snapshotKey("api::a.a", "doc1", "en");

    writeSnapshot(key, {
      takenAt: "2026-11-15T01:00:00.000Z",
      values: { title: "a" },
    });

    expect(readSnapshot(key)).toStrictEqual({
      takenAt: "2026-11-15T01:00:00.000Z",
      values: { title: "a" },
    });
  });

  it("returns undefined when nothing is stored or the entry is damaged", () => {
    expect(readSnapshot("missing")).toBeUndefined();

    storage.setItem("empty", "");
    expect(readSnapshot("empty")).toBeUndefined();

    storage.setItem("bad", "{not json");
    expect(readSnapshot("bad")).toBeUndefined();

    storage.setItem("shape", JSON.stringify({ values: 3 }));
    expect(readSnapshot("shape")).toBeUndefined();
  });

  it("clears a stored snapshot", () => {
    writeSnapshot("k", { takenAt: "t", values: {} });
    clearSnapshot("k");

    expect(readSnapshot("k")).toBeUndefined();
  });

  it("reports a failed write instead of throwing", () => {
    expect(writeSnapshot("k", { takenAt: "t", values: {} })).toBe(true);

    storage.setItem = () => {
      throw new Error("quota");
    };

    expect(writeSnapshot("k", { takenAt: "t", values: {} })).toBe(false);
  });

  it("copes with storage that is not available", () => {
    const unavailableStorage = undefined;

    vi.stubGlobal("sessionStorage", unavailableStorage);

    expect(readSnapshot("k")).toBeUndefined();
    expect(writeSnapshot("k", { takenAt: "t", values: {} })).toBe(false);
    expect(() => {
      clearSnapshot("k");
    }).not.toThrow();
  });
});
