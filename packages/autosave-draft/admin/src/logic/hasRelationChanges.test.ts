import { describe, expect, it, vi } from "vitest";

import { hasRelationChanges } from "./hasRelationChanges";

vi.setConfig({ testTimeout: 1000 });

describe("hasRelationChanges", () => {
  it("is false for values without relation edits", () => {
    expect(
      hasRelationChanges({
        title: "a",
        author: { connect: [], disconnect: [] },
        tags: ["x"],
      }),
    ).toBe(false);
  });

  it("sees a pending connect or disconnect", () => {
    expect(
      hasRelationChanges({ author: { connect: [{ id: 1 }], disconnect: [] } }),
    ).toBe(true);
    expect(
      hasRelationChanges({ author: { connect: [], disconnect: [{ id: 1 }] } }),
    ).toBe(true);
  });

  it("looks inside components and dynamic zones", () => {
    expect(
      hasRelationChanges({
        blocks: [{ __component: "a.b", rel: { connect: [{ id: 2 }] } }],
      }),
    ).toBe(true);
  });

  it("copes with empty values", () => {
    expect(hasRelationChanges(null)).toBe(false);
    expect(hasRelationChanges({ seo: null })).toBe(false);
  });
});
