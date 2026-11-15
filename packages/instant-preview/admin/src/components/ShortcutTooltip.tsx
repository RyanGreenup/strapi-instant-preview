import type { JSX, ReactElement } from "react";

import { useFormatHotkey } from "@ark-ui/react/hotkeys";
import { Portal } from "@ark-ui/react/portal";
import { Tooltip } from "@ark-ui/react/tooltip";
import { Flex, Typography } from "@strapi/design-system";
import { styled } from "styled-components";

const OPEN_DELAY_MS = 300;

const Positioner = styled(Tooltip.Positioner)`
  z-index: ${({ theme }) => theme.zIndices.tooltip};
`;

const Content = styled(Tooltip.Content)`
  padding: ${({ theme }) => theme.spaces[2]};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.neutral900};
  color: ${({ theme }) => theme.colors.neutral0};
`;

const Key = styled.kbd`
  min-width: 2rem;
  padding: 0 ${({ theme }) => theme.spaces[1]};
  border: 1px solid ${({ theme }) => theme.colors.neutral500};
  border-bottom-width: 2px;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-family: inherit;
  font-size: ${({ theme }) => theme.fontSizes[0]};
  line-height: 1.6rem;
  text-align: center;
`;

interface ShortcutTooltipProps {
  label: string;
  hotkey: string;
  // Share the dialog button's ID so merged tooltip props do not replace it.
  triggerId?: string;
  /** The child must forward its ref and props. */
  children: ReactElement;
}

/** Show a button label and platform-specific shortcut on hover or keyboard focus. */
const ShortcutTooltip = ({
  label,
  hotkey,
  triggerId,
  children,
}: ShortcutTooltipProps): JSX.Element => {
  const formatHotkey = useFormatHotkey();
  const keys = formatHotkey(hotkey, { separator: " " }).split(" ");

  return (
    <Tooltip.Root
      ids={triggerId === undefined ? undefined : { trigger: triggerId }}
      openDelay={OPEN_DELAY_MS}
      lazyMount
      unmountOnExit
    >
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Portal>
        <Positioner>
          <Content>
            <Flex gap={2}>
              <Typography variant="pi">{label}</Typography>
              <Flex gap={1} tag="span">
                {keys.map((key) => (
                  <Key key={key}>{key}</Key>
                ))}
              </Flex>
            </Flex>
          </Content>
        </Positioner>
      </Portal>
    </Tooltip.Root>
  );
};

export { ShortcutTooltip };
