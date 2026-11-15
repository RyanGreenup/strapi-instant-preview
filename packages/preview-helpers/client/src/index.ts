interface PreviewBridgeOptions {
  /**
   * URL of the Strapi admin.
   *
   * When omitted, read `data-strapi-preview-origin` from the current page for each
   * event. Without that marker, the bridge is idle.
   */
  adminOrigin?: string;
  /**
   * Refresh draft content
   *
   * This is best done through a client side update, e.g. in Astro use the client
   * router so it doesn't flicker.
   *
   * If the router resets scrolling, call `restoreScroll` after rendering. The bridge
   * also restores scrolling after the refresh succeeds.
   *
   * Defaults to a simple page reload.
   */
  refresh?: (restoreScroll: () => void) => void | Promise<void>;
}

const ORIGIN_MARKER = "[data-strapi-preview-origin]";

function hasType(data: unknown, type: string): boolean {
  return typeof data === "object" && data !== null && "type" in data && data.type === type;
}

/**
 * Connect a preview iframe to the Strapi admin.
 *
 * Refresh on `strapiUpdate` messages from the admin, Forward Ctrl+Alt+P as
 * `strapiPreviewToggle`. Outside an `iframe` this doesn't do anything.
 *
 * Start once per document, including across client-router swaps.
 *
 * @param options Admin origin and refresh strategy.
 * @returns A function that stops the bridge.
 */
function startPreviewBridge(options: Readonly<PreviewBridgeOptions> = {}): () => void {
  const admin = globalThis.parent;
  const framed = admin !== globalThis.self;

  const adminOrigin = (): string | undefined =>
    framed
      ? (options.adminOrigin ??
        document.querySelector<HTMLElement>(ORIGIN_MARKER)?.dataset["strapiPreviewOrigin"])
      : undefined;
  const refresh =
    options.refresh ??
    ((): void => {
      globalThis.location.reload();
    });

  const onMessage = (event: MessageEvent<unknown>): void => {
    const origin = adminOrigin();
    if (
      origin === undefined ||
      event.source !== admin ||
      event.origin !== origin ||
      !hasType(event.data, "strapiUpdate")
    ) {
      return;
    }
    const { scrollX, scrollY } = globalThis;
    const restoreScroll = (): void => {
      globalThis.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    };
    const run = async (): Promise<void> => {
      await refresh(restoreScroll);
      restoreScroll();
    };
    run().catch(reportError);
  };

  const onKeydown = (event: KeyboardEvent): void => {
    const origin = adminOrigin();
    if (
      origin !== undefined &&
      (event.ctrlKey || event.metaKey) &&
      event.altKey &&
      !event.shiftKey &&
      event.code === "KeyP"
    ) {
      event.preventDefault();
      admin.postMessage({ type: "strapiPreviewToggle" }, origin);
    }
  };

  globalThis.addEventListener("message", onMessage);
  globalThis.addEventListener("keydown", onKeydown);
  return () => {
    globalThis.removeEventListener("message", onMessage);
    globalThis.removeEventListener("keydown", onKeydown);
  };
}

export { startPreviewBridge };
export type { PreviewBridgeOptions };
