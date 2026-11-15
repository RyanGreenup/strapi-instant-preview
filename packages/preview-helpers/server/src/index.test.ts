import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PreviewDocument, PreviewParams } from "./index";

import {
  createPreviewConfig,
  previewHeaders,
  signPreviewUrl,
  verifyPreviewUrl,
} from "./index";

const SECRET = "test-secret-of-at-least-32-characters";
const HOUR = 3_600_000;
// 10:30 UTC, the middle of a clock-hour bucket.
const NOW = Date.UTC(2026, 0, 1, 10, 30);
const ARTICLE = "api::article.article";
const DRAFT: PreviewParams = {
  documentId: "doc1",
  locale: "en",
  status: "draft",
};
const ZERO_SIGNATURE = "0".repeat(64);

vi.setConfig({ testTimeout: 5000 });

const sign = (path = "/preview/blog/post", preview = DRAFT): URL =>
  new URL(signPreviewUrl(`https://web.example${path}`, preview, SECRET));

const resolvePath = vi.fn<
  (uid: string, document: PreviewDocument) => string | undefined
>((uid, { documentId }) =>
  uid === ARTICLE ? `/preview/blog/${documentId}` : undefined,
);

const options = {
  frontendUrl: "https://web.example/ignored",
  secret: SECRET,
  resolvePath,
};

describe("signed preview URLs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips the signed document", () => {
    expect(verifyPreviewUrl(sign(), SECRET)).toStrictEqual(DRAFT);
  });

  it("verifies a path-relative request URL", () => {
    const url = sign();
    expect(verifyPreviewUrl(url.pathname + url.search, SECRET)).toStrictEqual(
      DRAFT,
    );
  });

  it("appends the parameters in contract order", () => {
    expect([...sign().searchParams.keys()]).toStrictEqual([
      "documentId",
      "locale",
      "status",
      "expires",
      "signature",
    ]);
  });

  it("binds an absent locale and the published status", () => {
    const preview: PreviewParams = {
      documentId: "doc1",
      locale: "",
      status: "published",
    };
    expect(
      verifyPreviewUrl(sign("/preview/blog/post", preview), SECRET),
    ).toStrictEqual(preview);
  });

  it("handles Unicode and encoded paths", () => {
    const path = `/preview/blog/${encodeURIComponent("café & crème/100%")}`;
    const url = sign(path);
    expect(url.pathname).toBe(path);
    expect(verifyPreviewUrl(url, SECRET)).toStrictEqual(DRAFT);
  });

  it("keeps the URL stable within a clock hour and changes it after", () => {
    const first = sign().href;
    vi.setSystemTime(NOW + HOUR / 2 - 1);
    expect(sign().href).toBe(first);
    vi.setSystemTime(NOW + HOUR / 2);
    expect(sign().href).not.toBe(first);
  });

  it("expires 1 to 2 hours after signing", () => {
    const url = sign();
    // Signed at 10:30, so the link expires at 12:00.
    vi.setSystemTime(NOW + 1.5 * HOUR - 1000);
    expect(verifyPreviewUrl(url, SECRET)).toStrictEqual(DRAFT);
    vi.setSystemTime(NOW + 1.5 * HOUR);
    expect(verifyPreviewUrl(url, SECRET)).toBeUndefined();
  });

  it.each<[string, (url: URL) => void]>([
    [
      "path",
      (url) => {
        url.pathname = "/preview/blog/other";
      },
    ],
    [
      "documentId",
      (url) => {
        url.searchParams.set("documentId", "doc2");
      },
    ],
    [
      "locale",
      (url) => {
        url.searchParams.set("locale", "fr");
      },
    ],
    [
      "status",
      (url) => {
        url.searchParams.set("status", "published");
      },
    ],
    [
      "expires",
      (url) => {
        url.searchParams.set("expires", "9999999999");
      },
    ],
    [
      "signature",
      (url) => {
        url.searchParams.set("signature", ZERO_SIGNATURE);
      },
    ],
    [
      "malformed signature",
      (url) => {
        url.searchParams.set("signature", "x");
      },
    ],
    [
      "missing signature",
      (url) => {
        url.searchParams.delete("signature");
      },
    ],
    [
      "missing parameter",
      (url) => {
        url.searchParams.delete("locale");
      },
    ],
    [
      "duplicate parameter",
      (url) => {
        url.searchParams.append("status", "draft");
      },
    ],
    [
      "duplicate signature",
      (url) => {
        url.searchParams.append("signature", ZERO_SIGNATURE);
      },
    ],
    [
      "unexpected parameter",
      (url) => {
        url.searchParams.append("extra", "1");
      },
    ],
    [
      "reordered parameter",
      (url) => {
        url.searchParams.delete("documentId");
        url.searchParams.append("documentId", DRAFT.documentId);
      },
    ],
  ])("rejects a tampered %s", (_name, tamper) => {
    const url = sign();
    tamper(url);
    expect(verifyPreviewUrl(url, SECRET)).toBeUndefined();
  });

  it("rejects links signed with a rotated secret", () => {
    expect(verifyPreviewUrl(sign(), `rotated-${SECRET}`)).toBeUndefined();
  });

  it("refuses a secret shorter than 32 characters", () => {
    const short = "x".repeat(31);
    expect(() => signPreviewUrl("https://web.example/p", DRAFT, short)).toThrow(
      "at least 32 characters",
    );
    expect(() => verifyPreviewUrl(sign(), short)).toThrow(
      "at least 32 characters",
    );
  });

  it("rejects a correctly signed but empty document", () => {
    const url = sign("/preview/blog/post", { ...DRAFT, documentId: "" });
    expect(verifyPreviewUrl(url, SECRET)).toBeUndefined();
  });

  it("fails explicitly without a secret", () => {
    const url = sign();
    expect(() => signPreviewUrl("https://web.example/p", DRAFT, "")).toThrow(
      "secret is required",
    );
    expect(() => verifyPreviewUrl(url, "")).toThrow("secret is required");
  });

  it("refuses to sign a URL that has its own query", () => {
    expect(() =>
      signPreviewUrl("https://web.example/p?x=1", DRAFT, SECRET),
    ).toThrow("cannot carry its own query");
  });

  it("signs the path the host resolves", async () => {
    const { handler } = createPreviewConfig(options).config;
    await expect(handler(ARTICLE, { ...DRAFT })).resolves.toBe(
      sign("/preview/blog/doc1").href,
    );
  });

  it("defaults to a draft with no locale", async () => {
    const { handler } = createPreviewConfig(options).config;
    await expect(handler(ARTICLE, { documentId: "doc1" })).resolves.toBe(
      sign("/preview/blog/doc1", { ...DRAFT, locale: "" }).href,
    );
    expect(resolvePath).toHaveBeenLastCalledWith(ARTICLE, {
      documentId: "doc1",
      locale: undefined,
      status: "draft",
    });
  });
});

describe("createPreviewConfig", () => {
  it("returns Strapi's native preview config for the frontend origin", () => {
    const preview = createPreviewConfig(options);
    expect(preview.enabled).toBe(true);
    expect(preview.config.allowedOrigins).toStrictEqual([
      "https://web.example",
    ]);
  });

  it("returns no URL for unsupported types and unsaved entries", async () => {
    const { handler } = createPreviewConfig(options).config;
    await expect(
      handler("api::page.page", { documentId: "doc1" }),
    ).resolves.toBeUndefined();
    await expect(handler(ARTICLE, {})).resolves.toBeUndefined();
  });

  it("rejects a resolved path on another origin", async () => {
    const { handler } = createPreviewConfig({
      ...options,
      resolvePath: () => "//evil.example/preview",
    }).config;
    await expect(handler(ARTICLE, { documentId: "doc1" })).rejects.toThrow(
      "leaves the frontend origin",
    );
  });

  it("fails explicitly on missing configuration", () => {
    expect(() => createPreviewConfig({ ...options, secret: "" })).toThrow(
      "secret is required",
    );
    expect(() => createPreviewConfig({ ...options, frontendUrl: "" })).toThrow(
      "frontend URL is required",
    );
  });
});

describe("previewHeaders", () => {
  it("restricts framing to the admin origin", () => {
    expect(previewHeaders("https://cms.example/admin")).toStrictEqual({
      "Cache-Control": "private,no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex,nofollow",
      "Content-Security-Policy": "frame-ancestors https://cms.example",
    });
  });
});
