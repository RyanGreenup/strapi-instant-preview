import type { ReactNode, RefObject } from "react";

import { useHotkey } from "@ark-ui/react/hotkeys";
import { useFetchClient, useIsDesktop } from "@strapi/strapi/admin";
import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";

import type { PreviewState } from "../logic/previewUrl";

import { getAdminRoot } from "../hooks/useDockAnimation";
import { usePersistentState } from "../hooks/usePersistentState";
import {
  afterFailure,
  afterLookup,
  NO_PREVIEW,
  toAbsoluteUrl,
} from "../logic/previewUrl";
import { getTranslation } from "../utils/getTranslation";
import { warnOnce } from "../utils/warnOnce";
import { PreviewDialog } from "./PreviewDialog";

const UPDATE_MESSAGE = { type: "strapiUpdate" };
// Keyboard events cannot cross the iframe boundary; the target forwards this message.
const TOGGLE_MESSAGE_TYPE = "strapiPreviewToggle";
const TOGGLE_HOTKEY = "mod+alt+P";

interface PanelProps {
  model: string;
  documentId?: string;
  document?: {
    id?: number | string;
    locale?: string | null;
    status?: string;
    updatedAt?: string;
  };
}

/**
 * Allow docking only when Strapi places panels beside the form and the admin
 * root can reserve space.
 *
 * Otherwise, use an overlay.
 */
const useCanDock = (): boolean => {
  const isDesktop = useIsDesktop();
  const hasAdminRoot = Boolean(getAdminRoot());
  useEffect(() => {
    if (!hasAdminRoot) {
      warnOnce(
        "the admin root element was not found; the preview opens as an overlay",
      );
    }
  }, [hasAdminRoot]);
  return isDesktop && hasAdminRoot;
};

const usePreviewUrl = (
  { model, documentId, document }: PanelProps,
  iframeRef: RefObject<HTMLIFrameElement>,
): string | undefined => {
  const { get } = useFetchClient();
  const [url, setUrl] = useState<string>();
  const stateRef = useRef<PreviewState>(NO_PREVIEW);
  const isSaved = Boolean(document?.id);
  const locale = document?.locale ?? undefined;
  const status = document?.status === "published" ? "published" : "draft";
  const updatedAt = document?.updatedAt;
  const owner = [model, documentId, locale, status].join("\n");

  useEffect(
    () =>
      isSaved
        ? (() => {
            let isStale = false;
            const refreshUrl = async (): Promise<void> => {
              const { data } = await get<{ data?: { url?: string } }>(
                `/content-manager/preview/url/${model}`,
                { params: { documentId, locale, status } },
              );
              if (isStale) {
                return;
              }
              const { state, unchanged } = afterLookup(
                stateRef.current,
                owner,
                toAbsoluteUrl(data?.data?.url, globalThis.location.href),
              );
              stateRef.current = state;
              if (unchanged && state.url !== undefined) {
                iframeRef.current?.contentWindow?.postMessage(
                  UPDATE_MESSAGE,
                  new URL(state.url).origin,
                );
              } else {
                setUrl(state.url);
              }
            };
            refreshUrl().catch(() => {
              if (!isStale) {
                stateRef.current = afterFailure(stateRef.current, owner);
                setUrl(stateRef.current.url);
              }
            });
            return () => {
              isStale = true;
            };
          })()
        : undefined,
    [
      get,
      isSaved,
      model,
      documentId,
      locale,
      status,
      updatedAt,
      iframeRef,
      owner,
    ],
  );

  return url;
};

interface ToggleOptions {
  url: string | undefined;
  iframeRef: RefObject<HTMLIFrameElement>;
  toggle: () => void;
  label: string;
}

const usePreviewToggle = ({
  url,
  iframeRef,
  toggle,
  label,
}: ToggleOptions): void => {
  const current = useRef({ url, toggle });
  current.current = { url, toggle };
  useHotkey({
    hotkey: TOGGLE_HOTKEY,
    action: () => {
      current.current.toggle();
    },
    enabled: () => Boolean(current.current.url),
    label,
    options: { preventDefault: true, requireReset: true },
  });
  useEffect(
    () =>
      url !== undefined && url !== ""
        ? (() => {
            const { origin } = new URL(url);
            const onMessage = (event: MessageEvent<unknown>): void => {
              if (
                event.source === iframeRef.current?.contentWindow &&
                event.origin === origin &&
                typeof event.data === "object" &&
                event.data !== null &&
                "type" in event.data &&
                event.data.type === TOGGLE_MESSAGE_TYPE
              ) {
                current.current.toggle();
              }
            };
            globalThis.addEventListener("message", onMessage);
            return () => {
              globalThis.removeEventListener("message", onMessage);
            };
          })()
        : undefined,
    [url, iframeRef],
  );
};

/** Refresh the host's native preview URL after saves, messaging unchanged URLs. */
const LivePreviewPanel = (
  props: PanelProps,
): { title: string; content: ReactNode } | null => {
  const { formatMessage } = useIntl();
  const isDesktop = useCanDock();
  const [isDockOpen, setIsDockOpen] = usePersistentState<boolean>("open", true);
  // Unlike the persisted dock, the overlay starts closed on every page.
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  // oxlint-disable-next-line unicorn/no-null -- React DOM refs start unmounted.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const url = usePreviewUrl(props, iframeRef);
  const isOpen = isDesktop ? isDockOpen : isOverlayOpen;
  const setIsOpen = isDesktop ? setIsDockOpen : setIsOverlayOpen;
  const toggleLabel = formatMessage({
    id: getTranslation("panel.toggle"),
    defaultMessage: "Show or hide the preview",
  });
  usePreviewToggle({
    url,
    iframeRef,
    toggle: () => {
      setIsOpen(!isOpen);
    },
    label: toggleLabel,
  });
  const isSaved = Boolean(props.document?.id);
  if (!isSaved || url === undefined || url === "") {
    // oxlint-disable-next-line unicorn/no-null -- Strapi omits absent side panels.
    return null;
  }
  return {
    title: formatMessage({
      id: getTranslation("panel.title"),
      defaultMessage: "Live preview",
    }),
    content: (
      <PreviewDialog
        url={url}
        iframeRef={iframeRef}
        isDesktop={isDesktop}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        toggleLabel={toggleLabel}
        hotkey={TOGGLE_HOTKEY}
      />
    ),
  };
};

export { LivePreviewPanel };
