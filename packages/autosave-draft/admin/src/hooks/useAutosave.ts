import type { Snapshot } from "../logic/snapshot";

import { useAutosaveContext } from "./useAutosaveContext";
import {
  useAutosaveDebounce,
  useAutosaveReload,
  useAutosaveRevert,
} from "./useAutosaveLifecycle";
import { useAutosaveSave } from "./useAutosaveSave";
import { useAutosaveSession } from "./useAutosaveSession";

/** Content Manager does not export the edit view side panel's props. */
interface AutosaveTarget {
  model: string;
  collectionType: string;
  /** Absent for new entries and single types. */
  documentId?: string;
  /** Absent for new entries and the clone route. */
  document?: {
    /** Absent while a new locale is being created. */
    id?: number | string;
    documentId?: string;
    locale?: string | null;
    status?: string;
  };
  activeTab?: "draft" | "published" | null;
}

type AutosaveState =
  | "off"
  | "unsaved-entry"
  /** Published tab, no update permission, or a content type without drafts. */
  | "ineligible"
  | "idle"
  /** A change is waiting for the quiet period to end. */
  | "pending"
  | "saving"
  | "saved"
  /** Form validation prevented the request. */
  | "invalid"
  | "error";

interface Autosave {
  state: AutosaveState;
  /** Strapi's error message, when provided. */
  detail: string | undefined;
  lastSavedAt: Date | undefined;
  /** The revert point for autosaves in this browser tab. */
  snapshot: Snapshot | undefined;
  hasDraftAndPublish: boolean;
  /** Restore and save the snapshot. Return false if the save fails. */
  revert: () => Promise<boolean>;
  isReverting: boolean;
}

/**
 * Autosave after a quiet period while preserving edits made during each request.
 * Must run inside the edit view form.
 *
 * @param debounceMs - Quiet time in milliseconds after the last form change.
 */
const useAutosave = (
  target: AutosaveTarget,
  enabled: boolean,
  debounceMs: number,
): Autosave => {
  const context = useAutosaveContext(target, enabled);
  const session = useAutosaveSession(context);
  const save = useAutosaveSave(session.controller);

  // Observe all form values, including drag-and-drop, blocks, toggles, and pickers.
  useAutosaveDebounce({ context, session, save, debounceMs });
  useAutosaveReload(context, session.controller);
  const revert = useAutosaveRevert(context, session.controller, save);
  let state: AutosaveState = session.phase;

  if (!enabled) {
    state = "off";
  } else if (!context.isSavedEntry) {
    state = "unsaved-entry";
  } else if (!context.eligible) {
    state = "ineligible";
  }

  return {
    state,
    detail:
      state === "invalid" || state === "error" ? session.detail : undefined,
    lastSavedAt: session.lastSavedAt,
    snapshot: session.snapshot,
    hasDraftAndPublish: context.hasDraftAndPublish,
    revert,
    isReverting: session.isReverting,
  };
};

export { useAutosave };
export type { Autosave, AutosaveState, AutosaveTarget };
