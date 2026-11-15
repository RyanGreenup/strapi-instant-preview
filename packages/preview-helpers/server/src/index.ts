import { createHmac, timingSafeEqual } from "node:crypto";

type PreviewStatus = "draft" | "published";

/** The document a signed preview URL grants access to. */
interface PreviewParams {
  documentId: string;
  /** The empty string when the document has no locale. */
  locale: string;
  status: PreviewStatus;
}

/** The document Strapi asks a preview URL for. */
interface PreviewDocument {
  documentId: string;
  locale: string | undefined;
  status: PreviewStatus;
}

interface PreviewConfigOptions {
  /** Absolute URL of the frontend that renders previews. */
  frontendUrl: string | undefined;
  /** Signing secret shared only with the frontend server. */
  secret: string | undefined;
  /**
   * Maps a document to its frontend preview pathname, such as
   * `/preview/blog/my-post`. Return nothing for documents with no preview.
   */
  resolvePath: (
    uid: string,
    document: PreviewDocument,
  ) => string | null | undefined | Promise<string | null | undefined>;
}

/** Structurally matches the `preview` property of Strapi's admin config. */
interface PreviewConfig {
  enabled: true;
  config: {
    allowedOrigins: string[];
    handler: (
      uid: string,
      params: Readonly<Record<string, unknown>>,
    ) => Promise<string | undefined>;
  };
}

const PARAM_KEYS = ["documentId", "locale", "status", "expires"] as const;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/u;
const EXPIRY_PATTERN = /^\d+$/u;
const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;
const MS_PER_HOUR = SECONDS_PER_HOUR * MS_PER_SECOND;
/** Hours from the start of the current clock hour until a link expires. */
const EXPIRY_HOURS = 2;

/** Minimum signing-secret length. Use a random value. */
const MIN_SECRET_LENGTH = 32;

function requireSecret(secret: string | undefined): string {
  if (secret === undefined || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `A preview signing secret is required, of at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return secret;
}

function hmac(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/**
 * Reads the signed parameters once their signature is known to be genuine.
 *
 * @param params The query without its signature.
 * @returns The document, or nothing when a parameter is missing, duplicated,
 *   unexpected, malformed, or expired.
 */
function readParams(
  params: Readonly<URLSearchParams>,
): PreviewParams | undefined {
  if (
    params.size !== PARAM_KEYS.length ||
    PARAM_KEYS.some((name) => params.getAll(name).length !== 1)
  ) {
    return undefined;
  }

  const documentId = params.get("documentId") ?? "";
  const locale = params.get("locale") ?? "";
  const status = params.get("status");
  const expires = params.get("expires") ?? "";
  const expiry = Number(expires);
  if (
    documentId === "" ||
    (status !== "draft" && status !== "published") ||
    !EXPIRY_PATTERN.test(expires) ||
    !Number.isSafeInteger(expiry) ||
    expiry <= Math.floor(Date.now() / MS_PER_SECOND)
  ) {
    return undefined;
  }
  return { documentId, locale, status };
}

/**
 * Sign a frontend preview URL for one document.
 *
 * Links expire on a clock-hour boundary one to two hours ahead.
 * Identical inputs produce the same URL throughout that hour.
 *
 * @param target Absolute preview URL with no query string or fragment.
 * @param preview The document the URL grants access to.
 * @param secret Signing secret shared with the frontend server.
 * @returns The signed URL.
 */
function signPreviewUrl(
  target: Readonly<URL> | string,
  preview: Readonly<PreviewParams>,
  secret: string | undefined,
): string {
  const key = requireSecret(secret);
  const url = new URL(target);
  if (url.search || url.hash) {
    throw new Error("A preview URL cannot carry its own query or fragment");
  }

  const expires =
    (Math.floor(Date.now() / MS_PER_HOUR) + EXPIRY_HOURS) * SECONDS_PER_HOUR;
  url.searchParams.set("documentId", preview.documentId);
  url.searchParams.set("locale", preview.locale);
  url.searchParams.set("status", preview.status);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set(
    "signature",
    hmac(`${url.pathname}?${url.searchParams.toString()}`, key).toString("hex"),
  );
  return url.href;
}

/**
 * Verifies a URL produced by {@link signPreviewUrl}.
 *
 * Call this before fetching draft content. It grants no API permissions.
 *
 * @param requestUrl The incoming request URL, absolute or path-relative.
 * @param secret Signing secret shared with the Strapi server.
 * @returns The signed document, or nothing for invalid signatures or invalid
 *   or expired parameters.
 */
function verifyPreviewUrl(
  requestUrl: Readonly<URL> | string,
  secret: string | undefined,
): PreviewParams | undefined {
  const key = requireSecret(secret);
  // Only the path and query are signed, so the base origin is irrelevant.
  const url = new URL(requestUrl, "http://localhost");
  const params = new URLSearchParams(url.searchParams);
  const signatures = params.getAll("signature");
  const [signature] = signatures;
  if (
    signatures.length !== 1 ||
    signature === undefined ||
    !SIGNATURE_PATTERN.test(signature)
  ) {
    return undefined;
  }
  params.delete("signature");

  // Authenticate the path and the complete, ordered query, not selected fields.
  const expected = hmac(`${url.pathname}?${params.toString()}`, key);
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) {
    return undefined;
  }
  return readParams(params);
}

/**
 * Build the `preview` property of Strapi's admin config.
 *
 * Allow the frontend origin and sign each document's resolved preview path.
 *
 * @param options Frontend URL, signing secret, and the host's path resolver.
 * @returns Strapi's native preview configuration.
 */
function createPreviewConfig(
  options: Readonly<PreviewConfigOptions>,
): PreviewConfig {
  const { frontendUrl, resolvePath } = options;
  if (frontendUrl === undefined || frontendUrl === "") {
    throw new Error("A preview frontend URL is required");
  }
  const secret = requireSecret(options.secret);
  const { origin } = new URL(frontendUrl);

  return {
    enabled: true,
    config: {
      allowedOrigins: [origin],
      async handler(
        uid,
        { documentId, locale, status },
      ): Promise<string | undefined> {
        if (typeof documentId !== "string" || documentId === "") {
          return undefined;
        }
        const document: PreviewDocument = {
          documentId,
          locale:
            typeof locale === "string" && locale !== "" ? locale : undefined,
          status: status === "published" ? "published" : "draft",
        };

        const path = await resolvePath(uid, document);
        if (path === undefined || path === null || path === "") {
          return undefined;
        }
        const url = new URL(path, origin);
        if (url.origin !== origin) {
          throw new Error(`Preview path "${path}" leaves the frontend origin`);
        }
        return signPreviewUrl(
          url,
          {
            documentId,
            locale: document.locale ?? "",
            status: document.status,
          },
          secret,
        );
      },
    },
  };
}

/**
 * Build preview response headers.
 *
 * Disable caching, referrers, and indexing.
 * Restrict framing to the Strapi admin origin.
 *
 * @param adminUrl URL or origin of the Strapi admin.
 * @returns Header names and values.
 */
function previewHeaders(adminUrl: string): Record<string, string> {
  return {
    "Cache-Control": "private,no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex,nofollow",
    "Content-Security-Policy": `frame-ancestors ${new URL(adminUrl).origin}`,
  };
}

export {
  createPreviewConfig,
  previewHeaders,
  signPreviewUrl,
  verifyPreviewUrl,
};
export type {
  PreviewConfig,
  PreviewConfigOptions,
  PreviewDocument,
  PreviewParams,
  PreviewStatus,
};
