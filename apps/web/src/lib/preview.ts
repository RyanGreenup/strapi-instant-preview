import {
  previewHeaders,
  verifyPreviewUrl,
  type PreviewParams,
} from "@ryangreenup/strapi-preview-helpers/server";
import { PREVIEW_SECRET } from "astro:env/server";

import { strapiPublicUrl } from "./cms";

/**
 * Verify a preview link before fetching its document.
 *
 * Return `undefined` for tampered, malformed, or expired links, or when `PREVIEW_SECRET` is absent.
 */
export const verifyPreview = (url: URL): PreviewParams | undefined =>
  PREVIEW_SECRET ? verifyPreviewUrl(url, PREVIEW_SECRET) : undefined;

/** The Strapi admin origin, as the editor's browser sees it. */
export const strapiOrigin = new URL(strapiPublicUrl).origin;

/** No caching, referrers, or indexing; framing only by the Strapi admin. */
export const headers = previewHeaders(strapiOrigin);
