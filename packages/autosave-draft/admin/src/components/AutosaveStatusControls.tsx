import type { ReactElement } from "react";

import { Flex, Switch, Typography } from "@strapi/design-system";
import { useIntl } from "react-intl";

import type { Autosave, AutosaveState } from "../hooks/useAutosave";

import { getTranslation } from "../utils/getTranslation";

const STATUS_MESSAGES: Record<
  AutosaveState,
  { id: string; defaultMessage: string }
> = {
  off: {
    id: "status.off",
    defaultMessage: "Autosave is off. Use Save to store changes.",
  },
  "unsaved-entry": {
    id: "status.unsaved-entry",
    defaultMessage: "Autosave starts after the first save.",
  },
  ineligible: {
    id: "status.ineligible",
    defaultMessage: "Autosave is not available here.",
  },
  idle: { id: "status.idle", defaultMessage: "No changes to save." },
  pending: {
    id: "status.pending",
    defaultMessage: "Changes waiting to save...",
  },
  saving: { id: "status.saving", defaultMessage: "Saving..." },
  saved: { id: "status.saved", defaultMessage: "Saved at {time}" },
  invalid: {
    id: "status.invalid",
    defaultMessage: "Not saved: fix the errors in the form.",
  },
  error: {
    id: "status.error",
    defaultMessage: "Save failed. It is tried again on the next change.",
  },
};

interface StatusControlsProps {
  autosave: Autosave;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const AutosaveStatusControls = ({
  autosave,
  enabled,
  setEnabled,
}: StatusControlsProps): ReactElement => {
  const { formatMessage, formatTime } = useIntl();
  const { state, detail, lastSavedAt } = autosave;
  const t = (
    id: string,
    defaultMessage: string,
    values?: Record<string, string>,
  ): string =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);
  const status = STATUS_MESSAGES[state];
  const isError = state === "invalid" || state === "error";
  const time = lastSavedAt
    ? formatTime(lastSavedAt, { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <>
      <Flex justifyContent="space-between" alignItems="center" gap={2}>
        <Typography
          id="draft-autosave-toggle"
          variant="omega"
          textColor="neutral800"
        >
          {t("toggle.label", "Autosave draft")}
        </Typography>
        <Switch
          aria-labelledby="draft-autosave-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
          onLabel={t("toggle.on", "On")}
          offLabel={t("toggle.off", "Off")}
        />
      </Flex>
      <Typography
        tag="output"
        variant="pi"
        textColor={isError ? "danger600" : "neutral600"}
        aria-live="polite"
      >
        {detail !== undefined && detail !== ""
          ? t("status.detail", "Not saved: {detail}", { detail })
          : t(status.id, status.defaultMessage, { time })}
      </Typography>
    </>
  );
};

export { AutosaveStatusControls };
