import type { ReactElement } from "react";

import { Button, Dialog } from "@strapi/design-system";
import { useState } from "react";
import { useIntl } from "react-intl";

import type { AutosaveState } from "../hooks/useAutosave";
import type { Snapshot } from "../logic/snapshot";

import { getTranslation } from "../utils/getTranslation";

interface RevertDialogProps {
  snapshot: Snapshot;
  state: AutosaveState;
  isReverting: boolean;
  revert: () => Promise<boolean>;
}

const AutosaveRevertDialog = ({
  snapshot,
  state,
  isReverting,
  revert,
}: RevertDialogProps): ReactElement => {
  const { formatMessage, formatTime } = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const t = (
    id: string,
    defaultMessage: string,
    values?: Record<string, string>,
  ): string =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);
  const time = formatTime(new Date(snapshot.takenAt), {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger>
        <Button
          variant="danger-light"
          fullWidth
          disabled={isReverting || state === "saving" || state === "ineligible"}
          loading={isReverting}
        >
          {t("revert.button", "Revert to {time}", { time })}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>{t("revert.title", "Revert the draft?")}</Dialog.Header>
        <Dialog.Body>
          {t(
            "revert.body",
            "The draft goes back to how it was at {time}, before autosave changed it. Relation and media fields are not reverted.",
            { time },
          )}
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button variant="tertiary" fullWidth>
              {t("revert.cancel", "Cancel")}
            </Button>
          </Dialog.Cancel>
          <Dialog.Action>
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                void revert();
              }}
            >
              {t("revert.confirm", "Revert")}
            </Button>
          </Dialog.Action>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export { AutosaveRevertDialog };
