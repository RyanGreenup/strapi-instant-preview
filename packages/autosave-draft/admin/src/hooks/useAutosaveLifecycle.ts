import { useCallback, useEffect, useRef } from "react";

import type { AutosaveContext } from "./useAutosaveContext";
import type { Save } from "./useAutosaveSave";
import type { AutosaveController, AutosaveSession } from "./useAutosaveSession";

import { buildRevertValues } from "../logic/buildRevertValues";
import { changedKeys, isEqual } from "../logic/isEqual";
import { clearSnapshot, readSnapshot } from "../logic/snapshot";
import { reportSaveError } from "./useAutosaveSave";

/** Adopt the server baseline while retaining fields edited during the request. */
const useAutosaveReload = (
  context: AutosaveContext,
  controller: AutosaveController,
): void => {
  const { cachedDocument, values, initialValues, onChange } = context;
  const previousValues = useRef(values);
  const previousInitialValues = useRef(initialValues);

  // Child effects run before parent effects, allowing the baseline to update first.
  useEffect(() => {
    const pending = controller.awaitingReload.current;

    if (
      !pending ||
      cachedDocument === undefined ||
      cachedDocument === null ||
      pending.documentAtSend === cachedDocument
    ) {
      return;
    }
    clearTimeout(pending.timeout);
    controller.awaitingReload.current = undefined;
    // Keep lastSent until the reloaded form reaches this hook, sometimes several renders later.
    const { current } = controller.latest;
    const serverValues = current.getInitialFormValues();

    if (!serverValues || current.isSubmitting) {
      return;
    }
    const liveValues = current.getValues();
    const nextValues = { ...serverValues };

    for (const name of changedKeys(liveValues, pending.sent)) {
      nextValues[name] = liveValues[name];
    }
    current.resetForm(serverValues);
    current.setValues(nextValues);
  }, [cachedDocument, controller]);

  // If the form reloads first, restore edits against its new baseline instead.
  useEffect(() => {
    const beforeReload = previousValues.current;
    const didReload = previousInitialValues.current !== initialValues;

    previousValues.current = values;
    previousInitialValues.current = initialValues;
    if (!didReload) {
      return;
    }
    controller.lastSent.current = undefined;
    const pending = controller.awaitingReload.current;

    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    controller.awaitingReload.current = undefined;
    for (const name of changedKeys(beforeReload, pending.sent)) {
      onChange(name, beforeReload[name]);
    }
  }, [values, initialValues, onChange, controller]);

  useEffect(
    () => () => {
      if (controller.awaitingReload.current) {
        clearTimeout(controller.awaitingReload.current.timeout);
      }
    },
    [controller],
  );
};

interface DebounceOptions {
  context: AutosaveContext;
  session: AutosaveSession;
  save: Save;
  debounceMs: number;
}

const useAutosaveDebounce = ({
  context,
  session,
  save,
  debounceMs,
}: DebounceOptions): void => {
  const { eligible, modified, isSubmitting, values } = context;
  const { controller, isReverting, saveCount } = session;

  useEffect((): (() => void) | undefined => {
    if (!eligible || !modified) {
      controller.setPhase((current) =>
        current === "saving" || current === "saved" ? current : "idle",
      );

      return undefined;
    }
    if (
      isSubmitting ||
      controller.isBusy.current ||
      isReverting ||
      controller.failedFor.current === values
    ) {
      return undefined;
    }
    if (
      controller.lastSent.current &&
      isEqual(values, controller.lastSent.current)
    ) {
      return undefined;
    }
    controller.setPhase("pending");
    const timer = setTimeout(() => {
      void save();
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [
    eligible,
    modified,
    isSubmitting,
    isReverting,
    values,
    saveCount,
    debounceMs,
    save,
    controller,
  ]);
};

const useAutosaveRevert = (
  context: AutosaveContext,
  controller: AutosaveController,
  save: Save,
): (() => Promise<boolean>) => {
  const { attributes, components, setValues } = context;

  return useCallback(async (): Promise<boolean> => {
    const stored = readSnapshot(controller.latest.current.key);

    if (!stored || !attributes || controller.isBusy.current) {
      return false;
    }
    controller.setIsReverting(true);
    try {
      const next = buildRevertValues({
        snapshot: stored.values,
        current: controller.latest.current.getValues(),
        attributes,
        components,
      });

      setValues(next);
      const didSave = await save(next);

      if (didSave) {
        clearSnapshot(controller.latest.current.key);
        controller.setSnapshot(undefined);
      }

      return didSave;
    } catch (error) {
      reportSaveError(controller, error, controller.latest.current.getValues());

      return false;
    } finally {
      controller.setIsReverting(false);
    }
  }, [attributes, components, save, setValues, controller]);
};

export { useAutosaveDebounce, useAutosaveReload, useAutosaveRevert };
