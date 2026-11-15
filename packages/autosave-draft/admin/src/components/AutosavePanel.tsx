import type { ReactNode } from "react";

import { Flex } from "@strapi/design-system";
import { useIntl } from "react-intl";

import type { AutosaveTarget } from "../hooks/useAutosave";

import { useAutosave } from "../hooks/useAutosave";
import { usePersistentToggle } from "../hooks/usePersistentToggle";
import { usePluginConfig } from "../hooks/usePluginConfig";
import { getTranslation } from "../utils/getTranslation";
import { AutosaveRevertDialog } from "./AutosaveRevertDialog";
import { AutosaveStatusControls } from "./AutosaveStatusControls";

/** Share the editor's choice across entries in this browser. */
const TOGGLE_KEY = "draft-autosave:enabled";
type PanelDescription = { title: string; content: ReactNode } | null;

/** Provide autosave controls only for draft-and-publish content types. */
const AutosavePanel = (props: AutosaveTarget): PanelDescription => {
  const { formatMessage } = useIntl();
  const { debounceMs } = usePluginConfig();
  const [enabled, setEnabled] = usePersistentToggle(TOGGLE_KEY, true);
  const autosave = useAutosave(props, enabled, debounceMs);

  if (!autosave.hasDraftAndPublish) {
    return null;
  }

  return {
    title: formatMessage({
      id: getTranslation("panel.title"),
      defaultMessage: "Autosave",
    }),
    content: (
      <Flex direction="column" alignItems="stretch" gap={3} width="100%">
        <AutosaveStatusControls
          autosave={autosave}
          enabled={enabled}
          setEnabled={setEnabled}
        />
        {autosave.snapshot ? (
          <AutosaveRevertDialog
            snapshot={autosave.snapshot}
            state={autosave.state}
            isReverting={autosave.isReverting}
            revert={autosave.revert}
          />
        ) : null}
      </Flex>
    ),
  };
};

export { AutosavePanel };
