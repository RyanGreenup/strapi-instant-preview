import { useCallback } from "react";

import type { AutosaveContext, Values } from "./useAutosaveContext";
import type { AutosaveController, PendingReload } from "./useAutosaveSession";

import { describeSaveError } from "../logic/describeSaveError";
import { hasRelationChanges } from "../logic/hasRelationChanges";
import { isEqual } from "../logic/isEqual";
import { omitInvisibleFields } from "../logic/omitInvisibleFields";
import { readSnapshot, writeSnapshot } from "../logic/snapshot";
import { toApiData } from "../logic/toApiData";
import { warnOnce } from "../utils/warnOnce";

type Save = (override?: Values) => Promise<boolean>;
const REFRESH_TIMEOUT_MS = 5000;

const validateValues = async (
  current: AutosaveContext,
  controller: AutosaveController,
): Promise<Values | undefined> => {
  // Do not display errors while the editor is still filling in fields.
  const result = await current.validate(false, { status: "draft" });

  if ("errors" in result) {
    controller.failedFor.current = current.getValues();
    controller.setDetail(undefined);
    controller.setPhase("invalid");

    return undefined;
  }
  // Save or Publish may have started during validation.
  return controller.latest.current.isSubmitting
    ? undefined
    : current.getValues();
};

const retainSnapshot = (
  current: AutosaveContext,
  controller: AutosaveController,
): void => {
  if (readSnapshot(current.key)) {
    return;
  }
  const next = {
    takenAt: new Date().toISOString(),
    values: current.initialValues,
  };

  if (writeSnapshot(current.key, next)) {
    controller.setSnapshot(next);
  }
};

const armReload = (
  controller: AutosaveController,
  current: AutosaveContext,
  sent: Values,
): PendingReload => {
  if (controller.awaitingReload.current) {
    clearTimeout(controller.awaitingReload.current.timeout);
  }
  const pending = { sent, documentAtSend: current.cachedDocument };

  controller.awaitingReload.current = pending;
  controller.lastSent.current = sent;

  return pending;
};

const cancelFailedReload = (
  controller: AutosaveController,
  pending: PendingReload,
): void => {
  if (controller.awaitingReload.current === pending) {
    controller.awaitingReload.current = undefined;
  }
  if (controller.lastSent.current === pending.sent) {
    controller.lastSent.current = undefined;
  }
};

const expireReload = (
  controller: AutosaveController,
  pending: PendingReload,
): void => {
  if (controller.awaitingReload.current === pending) {
    // Do not mistake a later, unrelated reload for this save.
    pending.timeout = setTimeout(() => {
      if (controller.awaitingReload.current === pending) {
        controller.awaitingReload.current = undefined;
      }
    }, REFRESH_TIMEOUT_MS);
  }
};

const storeValues = async (
  current: AutosaveContext,
  controller: AutosaveController,
  sent: Values,
): Promise<void> => {
  retainSnapshot(current, controller);
  controller.setDetail(undefined);
  controller.setPhase("saving");
  // Cache updates can reload the form before the request resolves.
  const pending = armReload(controller, current, sent);

  try {
    const { didUpdateCache } = await current
      .saveDraft({
        url: current.url,
        data: omitInvisibleFields(toApiData(sent) as Values, {
          attributes: current.attributes,
          initialValues: current.initialValues,
          components: current.components,
        }),
        documentArgs: current.documentArgs,
        refreshRelations: hasRelationChanges(sent),
      })
      .unwrap();

    controller.failedFor.current = undefined;
    expireReload(controller, pending);
    if (!didUpdateCache) {
      warnOnce(
        "the edit view's cached document was not found; autosave reloads the form instead",
      );
      // A cache miss requires refetching, despite disabling dynamic zone fields temporarily.
      current.refetch();
    }
    controller.setLastSavedAt(new Date());
    controller.setPhase("saved");
  } catch (error) {
    cancelFailedReload(controller, pending);
    throw error;
  }
};

const reportSaveError = (
  controller: AutosaveController,
  error: unknown,
  values: Values,
): void => {
  const { isValidation, message } = describeSaveError(error);

  controller.failedFor.current = values;
  controller.setDetail(message);
  controller.setPhase(isValidation ? "invalid" : "error");
};

const useAutosaveSave = (controller: AutosaveController): Save =>
  useCallback(
    async (override?: Values): Promise<boolean> => {
      if (controller.isBusy.current) {
        return false;
      }
      controller.isBusy.current = true;
      const { current } = controller.latest;

      try {
        const sent = override ?? (await validateValues(current, controller));

        if (sent === undefined) {
          return false;
        }
        if (
          override === undefined &&
          controller.lastSent.current &&
          isEqual(sent, controller.lastSent.current)
        ) {
          // Already stored, but the form has not reloaded yet.
          return true;
        }
        await storeValues(current, controller, sent);

        return true;
      } catch (error) {
        reportSaveError(controller, error, current.getValues());

        return false;
      } finally {
        controller.isBusy.current = false;
        // Include edits made during the request in the next scheduling pass.
        controller.setSaveCount((count) => count + 1);
      }
    },
    [controller],
  );

export { reportSaveError, useAutosaveSave };
export type { Save };
