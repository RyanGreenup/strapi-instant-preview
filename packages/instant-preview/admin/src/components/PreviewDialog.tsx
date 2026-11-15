import type { JSX, RefObject } from "react";

import { Dialog } from "@ark-ui/react/dialog";
import { Button } from "@strapi/design-system";
import { useId } from "react";
import { useIntl } from "react-intl";

import { useExitState } from "../hooks/useDockAnimation";
import { getTranslation } from "../utils/getTranslation";
import { PanelReflow } from "./PanelReflow";
import { PreviewDock } from "./PreviewDock";
import { ShortcutTooltip } from "./ShortcutTooltip";

interface PreviewDialogProps {
  url: string;
  iframeRef: RefObject<HTMLIFrameElement>;
  isDesktop: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleLabel: string;
  hotkey: string;
}

/** Keep the editor interactive when docked and trap focus only in the overlay. */
const PreviewDialog = ({
  url,
  iframeRef,
  isDesktop,
  isOpen,
  setIsOpen,
  toggleLabel,
  hotkey,
}: PreviewDialogProps): JSX.Element => {
  const { formatMessage } = useIntl();
  const triggerId = useId();
  const closeTriggerId = useId();
  const { isExiting, endExit } = useExitState(isOpen, isDesktop);
  const isOverlay = !isDesktop;

  return (
    <Dialog.Root
      ids={{ trigger: triggerId, closeTrigger: closeTriggerId }}
      open={isOpen}
      present={isOpen || isExiting}
      onOpenChange={({ open }) => {
        setIsOpen(open);
      }}
      lazyMount
      unmountOnExit
      modal={isOverlay}
      trapFocus={isOverlay}
      preventScroll={isOverlay}
      closeOnEscape={isOverlay}
      closeOnInteractOutside={false}
      // The nonmodal dock must not take focus from the editor on page load.
      initialFocusEl={isOverlay ? undefined : () => false}
    >
      <ShortcutTooltip
        label={toggleLabel}
        hotkey={hotkey}
        triggerId={triggerId}
      >
        <Dialog.Trigger asChild>
          <Button variant="tertiary" width="100%">
            {formatMessage({
              id: getTranslation(isOpen ? "panel.hide" : "panel.show"),
              defaultMessage: isOpen ? "Hide preview" : "Show preview",
            })}
          </Button>
        </Dialog.Trigger>
      </ShortcutTooltip>
      <PreviewDock
        url={url}
        iframeRef={iframeRef}
        isOverlay={isOverlay}
        open={isOpen}
        isExiting={isExiting}
        onExitComplete={endExit}
        hotkey={hotkey}
        closeTriggerId={closeTriggerId}
      />
      {/* Strapi supplies its own panel drawer in the overlay layout. */}
      {isDesktop && <PanelReflow />}
    </Dialog.Root>
  );
};

export { PreviewDialog };
