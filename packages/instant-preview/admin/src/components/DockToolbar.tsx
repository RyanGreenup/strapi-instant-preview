import type { JSX, RefObject } from "react";

import { Dialog } from "@ark-ui/react/dialog";
import { Flex, IconButton, Typography } from "@strapi/design-system";
import { ArrowClockwise, Cross, ExternalLink } from "@strapi/icons";
import { useIntl } from "react-intl";

import { getTranslation } from "../utils/getTranslation";
import { ShortcutTooltip } from "./ShortcutTooltip";

/** Share the preview frame and dialog trigger identities with its toolbar. */
interface DockToolbarProps {
  url: string;
  iframeRef: RefObject<HTMLIFrameElement>;
  hotkey: string;
  closeTriggerId: string;
}

/** Provide reload, new-tab, and dialog-close actions for the preview frame. */
const DockToolbar = ({
  url,
  iframeRef,
  hotkey,
  closeTriggerId,
}: DockToolbarProps): JSX.Element => {
  const { formatMessage } = useIntl();
  const closeLabel = formatMessage({
    id: getTranslation("dock.close"),
    defaultMessage: "Hide preview",
  });

  return (
    <Flex
      gap={1}
      padding={2}
      paddingLeft={4}
      borderWidth="0 0 1px 0"
      borderColor="neutral150"
    >
      <Flex flex={1} minWidth={0}>
        <Dialog.Title asChild>
          <Typography variant="pi" textColor="neutral600" ellipsis>
            {url}
          </Typography>
        </Dialog.Title>
      </Flex>
      <IconButton
        variant="ghost"
        label={formatMessage({
          id: getTranslation("dock.reload"),
          defaultMessage: "Reload preview",
        })}
        onClick={() => {
          if (iframeRef.current) {
            iframeRef.current.src = url;
          }
        }}
      >
        <ArrowClockwise />
      </IconButton>
      <IconButton
        variant="ghost"
        label={formatMessage({
          id: getTranslation("dock.open"),
          defaultMessage: "Open in a new tab",
        })}
        onClick={() => {
          globalThis.open(url, "_blank", "noopener");
        }}
      >
        <ExternalLink />
      </IconButton>
      <ShortcutTooltip
        label={closeLabel}
        hotkey={hotkey}
        triggerId={closeTriggerId}
      >
        <Dialog.CloseTrigger asChild>
          <IconButton variant="ghost" label={closeLabel} withTooltip={false}>
            <Cross />
          </IconButton>
        </Dialog.CloseTrigger>
      </ShortcutTooltip>
    </Flex>
  );
};

export type { DockToolbarProps };
export { DockToolbar };
