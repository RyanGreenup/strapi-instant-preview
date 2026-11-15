import { describe, expect, it, vi } from "vitest";

import { buildRevertValues } from "./buildRevertValues";

vi.setConfig({ testTimeout: 1000 });

const attributes = {
  title: { type: "string" },
  body: { type: "blocks" },
  cover: { type: "media" },
  author: { type: "relation" },
  seo: { type: "component", component: "shared.seo" },
  slides: { type: "component", component: "shared.slide", repeatable: true },
  blocks: { type: "dynamiczone", components: ["shared.quote", "shared.slide"] },
};

const components = {
  "shared.seo": {
    attributes: { metaTitle: { type: "string" }, image: { type: "media" } },
  },
  "shared.slide": {
    attributes: {
      caption: { type: "string" },
      link: { type: "relation" },
      inner: { type: "component", component: "shared.seo" },
    },
  },
  "shared.quote": { attributes: { text: { type: "string" } } },
};

const revert = (
  snapshot: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> =>
  buildRevertValues({ snapshot, current, attributes, components });

describe("buildRevertValues", () => {
  it("takes plain fields from the snapshot", () => {
    expect(
      revert({ title: "old", body: [1] }, { title: "new", body: [2] }),
    ).toMatchObject({
      title: "old",
      body: [1],
    });
  });

  it("clears a plain field that was empty in the snapshot", () => {
    const result = revert({}, { title: "new" });

    expect(result["title"]).toBeUndefined();
    expect("title" in result).toBe(true);
  });

  it("keeps top-level relation and media fields as they are now", () => {
    const current = {
      cover: { id: 9 },
      author: { connect: [{ id: 3 }], disconnect: [] },
    };

    expect(
      revert(
        { cover: { id: 1 }, author: { connect: [], disconnect: [] } },
        current,
      ),
    ).toMatchObject(current);
  });

  it("keeps values of keys the schema does not know", () => {
    expect(revert({ extra: "old" }, { extra: "now" })["extra"]).toBe("now");
  });

  it("restores a component that still exists with its id", () => {
    const result = revert(
      { seo: { id: 5, metaTitle: "old", image: { id: 1 } } },
      { seo: { id: 5, metaTitle: "new", image: { id: 2 } } },
    );

    expect(result["seo"]).toStrictEqual({
      id: 5,
      metaTitle: "old",
      image: { id: 1 },
    });
  });

  it("recreates a component that was removed, without its old id", () => {
    const result = revert(
      { seo: { id: 5, metaTitle: "old" } },
      { seo: undefined },
    );

    expect(result["seo"]).toStrictEqual({ metaTitle: "old" });
  });

  it("handles repeatable components entry by entry", () => {
    const result = revert(
      {
        slides: [
          { id: 1, caption: "one" },
          { id: 2, caption: "two" },
        ],
      },
      { slides: [{ id: 2, caption: "two edited" }] },
    );

    expect(result["slides"]).toStrictEqual([
      { caption: "one", inner: undefined },
      { id: 2, caption: "two", link: undefined, inner: undefined },
    ]);
  });

  it("keeps current relations inside a component that still exists", () => {
    const pending = { connect: [{ id: 7 }], disconnect: [] };
    const result = revert(
      {
        slides: [
          { id: 1, caption: "one", link: { connect: [], disconnect: [] } },
        ],
      },
      { slides: [{ id: 1, caption: "x", link: pending }] },
    );

    expect(result["slides"]).toStrictEqual([
      { id: 1, caption: "one", link: pending, inner: undefined },
    ]);
  });

  it("drops stale ids of nested components too", () => {
    const result = revert(
      { slides: [{ id: 1, caption: "one", inner: { id: 4, metaTitle: "m" } }] },
      { slides: [] },
    );

    expect(result["slides"]).toStrictEqual([
      { caption: "one", inner: { metaTitle: "m" } },
    ]);
  });

  it("matches dynamic zone entries by component and id", () => {
    const result = revert(
      {
        blocks: [
          { __component: "shared.quote", id: 1, text: "q" },
          { __component: "shared.slide", id: 1, caption: "s" },
        ],
      },
      { blocks: [{ __component: "shared.slide", id: 1, caption: "changed" }] },
    );

    expect(result["blocks"]).toStrictEqual([
      { __component: "shared.quote", text: "q" },
      {
        __component: "shared.slide",
        id: 1,
        caption: "s",
        link: undefined,
        inner: undefined,
      },
    ]);
  });

  it("restores an emptied dynamic zone or component", () => {
    const result = revert(
      { blocks: [], seo: null },
      { blocks: [{ __component: "shared.quote" }], seo: { id: 1 } },
    );

    expect(result["blocks"]).toStrictEqual([]);
    expect(result["seo"]).toBeNull();
  });

  it("does not change its inputs", () => {
    const snapshot = { seo: { id: 5, metaTitle: "old" } };

    revert(snapshot, {});

    expect(snapshot).toStrictEqual({ seo: { id: 5, metaTitle: "old" } });
  });
});
