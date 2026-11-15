import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Snapshot } from "../logic/snapshot";
import type { AutosaveState } from "./useAutosave";
import type { AutosaveContext, Values } from "./useAutosaveContext";

import { clearSnapshot, readSnapshot } from "../logic/snapshot";

type Phase = Exclude<AutosaveState, "off" | "unsaved-entry" | "ineligible">;
type Setter<T> = Dispatch<SetStateAction<T>>;

/** Track a save until the form adopts its server values. */
interface PendingReload {
  sent: Values;
  documentAtSend: unknown;
  timeout?: ReturnType<typeof setTimeout>;
}

interface AutosaveController {
  latest: MutableRefObject<AutosaveContext>;
  isBusy: MutableRefObject<boolean>;
  lastSent: MutableRefObject<Values | undefined>;
  failedFor: MutableRefObject<Values | undefined>;
  awaitingReload: MutableRefObject<PendingReload | undefined>;
  setPhase: Setter<Phase>;
  setLastSavedAt: Setter<Date | undefined>;
  setDetail: Setter<string | undefined>;
  setSnapshot: Setter<Snapshot | undefined>;
  setIsReverting: Setter<boolean>;
  setSaveCount: Setter<number>;
}

interface AutosaveSession {
  phase: Phase;
  detail: string | undefined;
  lastSavedAt: Date | undefined;
  snapshot: Snapshot | undefined;
  isReverting: boolean;
  saveCount: number;
  controller: AutosaveController;
}

const useSnapshotLifecycle = (
  context: AutosaveContext,
  controller: AutosaveController,
): void => {
  const { key, isSavedEntry, status } = context;
  const previousStatus = useRef({ key, status });

  useEffect(() => {
    controller.setSnapshot(isSavedEntry ? readSnapshot(key) : undefined);
    controller.setPhase("idle");
    controller.setLastSavedAt(undefined);
    controller.setDetail(undefined);
    controller.lastSent.current = undefined;
    controller.failedFor.current = undefined;
  }, [key, isSavedEntry, controller]);

  useEffect(() => {
    const previous = previousStatus.current;

    previousStatus.current = { key, status };
    // Publishing makes the old draft revert point obsolete.
    if (
      previous.key === key &&
      previous.status !== undefined &&
      previous.status !== status &&
      status === "published"
    ) {
      clearSnapshot(key);
      controller.setSnapshot(undefined);
    }
  }, [key, status, controller]);
};

const useAutosaveSession = (context: AutosaveContext): AutosaveSession => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date>();
  const [detail, setDetail] = useState<string>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [isReverting, setIsReverting] = useState(false);
  const [saveCount, setSaveCount] = useState(0);
  const latest = useRef(context);
  const isBusy = useRef(false);
  const lastSent = useRef<Values>();
  const failedFor = useRef<Values>();
  const awaitingReload = useRef<PendingReload>();

  latest.current = context;
  // Stable references keep the save callback and its debounce independent of renders.
  const controller = useMemo<AutosaveController>(
    () => ({
      latest,
      isBusy,
      lastSent,
      failedFor,
      awaitingReload,
      setPhase,
      setLastSavedAt,
      setDetail,
      setSnapshot,
      setIsReverting,
      setSaveCount,
    }),
    [],
  );

  useSnapshotLifecycle(context, controller);

  return {
    phase,
    detail,
    lastSavedAt,
    snapshot,
    isReverting,
    saveCount,
    controller,
  };
};

export { useAutosaveSession };
export type { AutosaveController, AutosaveSession, PendingReload };
