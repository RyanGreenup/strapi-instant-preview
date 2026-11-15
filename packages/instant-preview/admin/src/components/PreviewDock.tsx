import type { JSX } from "react";

import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { Splitter } from "@ark-ui/react/splitter";
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { useIntl } from "react-intl";
import { styled } from "styled-components";

import type { DockToolbarProps } from "./DockToolbar";

import { getAdminRoot, useDockAnimation } from "../hooks/useDockAnimation";
import { usePersistentState } from "../hooks/usePersistentState";
import { getTranslation } from "../utils/getTranslation";
import { DockToolbar } from "./DockToolbar";

// Percentages of the viewport; reserve room for navigation and a narrow form.
const MIN_WIDTH = 25;
const MAX_WIDTH = 70;
const DEFAULT_WIDTH = 40;
const MIN_EDITOR_WIDTH = 640;
const OVERLAY_Z_INDEX = 200;

const subscribeToResize = (onChange: () => void): (() => void) => {
  globalThis.addEventListener("resize", onChange);
  return () => {
    globalThis.removeEventListener("resize", onChange);
  };
};

const useDockWidth = (): readonly [number, number, (width: number) => void] => {
  const viewport = useSyncExternalStore(
    subscribeToResize,
    () => globalThis.innerWidth,
  );
  const room = 100 - (MIN_EDITOR_WIDTH / viewport) * 100;
  const maxWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, room));
  const [storedWidth, setWidth] = usePersistentState<number>(
    "width",
    DEFAULT_WIDTH,
  );
  const width = Math.min(maxWidth, Math.max(MIN_WIDTH, storedWidth));

  // Persist the clamp: the splitter otherwise leaves a gap when its limit grows.
  useEffect(() => {
    if (storedWidth !== width) {
      setWidth(width);
    }
  }, [storedWidth, width, setWidth]);

  return [width, maxWidth, setWidth];
};

const useAdminWidth = (
  width: number,
  isVisible: boolean,
  isOverlay: boolean,
): void => {
  useLayoutEffect(() => {
    const root = getAdminRoot();
    return root && isVisible && !isOverlay
      ? (() => {
          const previousWidth = root.style.width;
          root.style.width = `${100 - width}vw`;
          return () => {
            root.style.width = previousWidth;
          };
        })()
      : undefined;
  }, [width, isVisible, isOverlay]);
};

// Measure the whole viewport while letting clicks reach the editor under the dock.
const Positioner = styled(Dialog.Positioner)<{ $isOverlay: boolean }>`
  position: fixed;
  inset: 0;
  z-index: ${({ $isOverlay }) => ($isOverlay ? OVERLAY_Z_INDEX : 1)};
  pointer-events: ${({ $isOverlay }) => ($isOverlay ? "auto" : "none")};
`;

const Layout = styled(Splitter.Root)`
  height: 100%;

  /* The iframe must not intercept a resize drag. */
  &[data-dragging] iframe {
    pointer-events: none;
  }
`;

const ResizeTrigger = styled(Splitter.ResizeTrigger)`
  width: 6px;
  cursor: col-resize;
  touch-action: none;
  pointer-events: auto;
  background: ${({ theme }) => theme.colors.neutral150};
  outline: none;

  &:hover,
  &[data-dragging],
  &[data-focus] {
    background: ${({ theme }) => theme.colors.primary500};
  }
`;

const Content = styled(Dialog.Content)`
  display: flex;
  flex-direction: column;
  height: 100%;
  pointer-events: auto;
  background: ${({ theme }) => theme.colors.neutral0};
`;

const Frame = styled.iframe`
  flex: 1;
  width: 100%;
  border: none;
  background: #ffffff;
`;

interface PreviewDockProps extends DockToolbarProps {
  isOverlay: boolean;
  // Use the parent's open state: Ark's dialog context follows one render later.
  open: boolean;
  isExiting: boolean;
  onExitComplete: () => void;
}

/** Reserve editor space for a nonmodal dock, or cover it with a modal overlay. */
const PreviewDock = ({
  url,
  iframeRef,
  isOverlay,
  open,
  isExiting,
  onExitComplete,
  hotkey,
  closeTriggerId,
}: PreviewDockProps): JSX.Element | null => {
  const { formatMessage } = useIntl();
  const isVisible = open || isExiting;
  const [width, maxWidth, setWidth] = useDockWidth();
  useAdminWidth(width, isVisible, isOverlay);
  // This must follow the width effect: opening reads the admin's target width.
  const { contentRef, finishAnimations } = useDockAnimation({
    open,
    isExiting,
    isOverlay,
    onExitComplete,
  });
  if (!isVisible) {
    // oxlint-disable-next-line unicorn/no-null -- React renders no closed dock.
    return null;
  }
  const content = (
    <Content ref={contentRef}>
      <DockToolbar
        url={url}
        iframeRef={iframeRef}
        hotkey={hotkey}
        closeTriggerId={closeTriggerId}
      />
      <Frame
        ref={iframeRef}
        src={url}
        title={formatMessage({
          id: getTranslation("dock.frame"),
          defaultMessage: "Preview",
        })}
      />
    </Content>
  );

  return (
    <Portal>
      <Positioner $isOverlay={isOverlay}>
        {isOverlay ? (
          content
        ) : (
          <Layout
            panels={[
              { id: "admin", minSize: 100 - maxWidth },
              { id: "preview", minSize: MIN_WIDTH, maxSize: maxWidth },
            ]}
            size={[100 - width, width]}
            onResizeStart={finishAnimations}
            onResize={({ size }) => {
              const [, previewWidth] = size;
              if (previewWidth !== undefined) {
                setWidth(previewWidth);
              }
            }}
          >
            <Splitter.Panel id="admin" />
            <ResizeTrigger
              id="admin:preview"
              aria-label={formatMessage({
                id: getTranslation("dock.resize"),
                defaultMessage: "Resize preview",
              })}
            />
            <Splitter.Panel id="preview">{content}</Splitter.Panel>
          </Layout>
        )}
      </Positioner>
    </Portal>
  );
};

export { PreviewDock };
