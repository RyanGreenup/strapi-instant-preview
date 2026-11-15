import { isPlainObject } from "./isPlainObject";

/** Store the draft's form values before autosave first writes to it. */
export interface Snapshot {
  /** ISO timestamp of the snapshot. */
  takenAt: string;
  values: Record<string, unknown>;
}

// Browser settings can make even accessing sessionStorage throw.

/** Scope snapshots by model, document and locale. */
export const snapshotKey = (
  model: string,
  documentId?: string,
  locale?: string | null,
): string =>
  ["draft-autosave:snapshot", model, documentId ?? "", locale ?? ""].join(":");

/** Return undefined for missing, unreadable or invalid snapshots. */
export const readSnapshot = (key: string): Snapshot | undefined => {
  try {
    const parsed: unknown = JSON.parse(
      globalThis.sessionStorage.getItem(key) ?? "null",
    );

    if (
      isPlainObject(parsed) &&
      typeof parsed["takenAt"] === "string" &&
      isPlainObject(parsed["values"])
    ) {
      return { takenAt: parsed["takenAt"], values: parsed["values"] };
    }
  } catch {
    // Treat unreadable storage as a missing snapshot.
  }

  return undefined;
};

/** Return false if storage is unavailable or full. */
export const writeSnapshot = (key: string, snapshot: Snapshot): boolean => {
  try {
    globalThis.sessionStorage.setItem(key, JSON.stringify(snapshot));

    return true;
  } catch {
    return false;
  }
};

export const clearSnapshot = (key: string): void => {
  try {
    globalThis.sessionStorage.removeItem(key);
  } catch {
    // Unavailable storage needs no cleanup.
  }
};
