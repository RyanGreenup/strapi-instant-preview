import { describe, expect, it, vi } from "vitest";

import { buildValidParams } from "./buildValidParams";

vi.setConfig({ testTimeout: 1000 });

describe("buildValidParams", () => {
  it("returns undefined for no query", () => {
    const query = undefined;

    expect(buildValidParams(query)).toBeUndefined();
  });

  it("lifts plugin options to the top level and drops plugins", () => {
    expect(
      buildValidParams({
        status: "draft",
        plugins: { i18n: { locale: "en" } },
      }),
    ).toStrictEqual({
      status: "draft",
      locale: "en",
    });
  });

  it("ignores plugin options that are not objects", () => {
    expect(buildValidParams({ plugins: { a: "x", b: null } })).toStrictEqual(
      {},
    );
  });
});
