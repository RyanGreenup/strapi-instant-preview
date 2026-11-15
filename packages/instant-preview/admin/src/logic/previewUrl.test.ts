import { describe, expect, it, vi } from "vitest";

import {
  afterFailure,
  afterLookup,
  NO_PREVIEW,
  toAbsoluteUrl,
} from "./previewUrl";

const ADMIN = "https://cms.example/admin/content-manager";
const URL_A = "https://web.example/preview/a?signature=1";
const URL_B = "https://web.example/preview/b?signature=2";
const DOC = "api::article.article\ndoc1\nen\ndraft";
const OTHER_DOC = "api::article.article\ndoc2\nen\ndraft";

vi.setConfig({ testTimeout: 5000 });

describe("toAbsoluteUrl", () => {
  it("keeps an absolute URL", () => {
    expect(toAbsoluteUrl(URL_A, ADMIN)).toBe(URL_A);
  });

  it("resolves a path against the admin", () => {
    expect(toAbsoluteUrl("/preview/foo", ADMIN)).toBe(
      "https://cms.example/preview/foo",
    );
  });

  it.each([undefined, "", "http://", "https://exa mple.com/"])(
    "returns nothing for %j",
    (raw) => {
      expect(toAbsoluteUrl(raw, ADMIN)).toBeUndefined();
    },
  );
});

describe("afterLookup", () => {
  it("loads the first URL", () => {
    expect(afterLookup(NO_PREVIEW, DOC, URL_A)).toStrictEqual({
      state: { url: URL_A, owner: DOC },
      unchanged: false,
    });
  });

  it("messages the preview when the URL is the same", () => {
    const state = { url: URL_A, owner: DOC };
    expect(afterLookup(state, DOC, URL_A).unchanged).toBe(true);
  });

  it("loads a changed URL", () => {
    const state = { url: URL_A, owner: DOC };
    expect(afterLookup(state, DOC, URL_B)).toStrictEqual({
      state: { url: URL_B, owner: DOC },
      unchanged: false,
    });
  });

  it("shows no preview when the handler returns none", () => {
    const state = { url: URL_A, owner: DOC };
    expect(afterLookup(state, DOC)).toStrictEqual({
      state: { url: undefined, owner: DOC },
      unchanged: false,
    });
  });
});

describe("afterFailure", () => {
  it("shows no preview when the first lookup fails", () => {
    expect(afterFailure(NO_PREVIEW, DOC).url).toBeUndefined();
  });

  it("keeps the last URL when a later lookup for the document fails", () => {
    const state = { url: URL_A, owner: DOC };
    expect(afterFailure(state, DOC)).toBe(state);
  });

  it("drops the URL when the lookup for another document fails", () => {
    const state = { url: URL_A, owner: DOC };
    expect(afterFailure(state, OTHER_DOC).url).toBeUndefined();
  });
});
