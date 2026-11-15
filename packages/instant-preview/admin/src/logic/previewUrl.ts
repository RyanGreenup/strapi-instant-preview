/** The preview URL on show, and the document it was resolved for. */
interface PreviewState {
  url: string | undefined;
  owner: string | undefined;
}

interface LookupStep {
  state: PreviewState;
  /** The URL is unchanged: message the open preview instead of loading it. */
  unchanged: boolean;
}

const NO_PREVIEW: PreviewState = { url: undefined, owner: undefined };

/**
 * Resolve a preview URL against the admin page URL.
 *
 * @param raw The native preview handler's URL or path.
 * @param base The admin page URL.
 * @returns The absolute URL, or `undefined` for missing, empty, or invalid input.
 */
const toAbsoluteUrl = (
  raw: string | undefined,
  base: string,
): string | undefined => {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  try {
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Apply a successful preview lookup.
 *
 * @param owner The document identity used for this lookup.
 * @param url The absolute URL, or `undefined` when preview is unavailable.
 * @returns The next state and whether its URL matches the previous URL.
 */
const afterLookup = (
  state: Readonly<PreviewState>,
  owner: string,
  url?: string,
): LookupStep => ({
  state: { url, owner },
  unchanged: url !== undefined && url === state.url,
});

/**
 * Handle a failed preview lookup.
 *
 * For the same document, keep the last successful URL so transient errors don't annoyingly close the preview.
 * For another document, clear the preview.
 *
 * @param owner The document identity used for this lookup.
 */
const afterFailure = (
  state: Readonly<PreviewState>,
  owner: string,
): PreviewState => (state.owner === owner ? state : NO_PREVIEW);

export { afterFailure, afterLookup, NO_PREVIEW, toAbsoluteUrl };
export type { LookupStep, PreviewState };
