import { useCallback, useState } from "react";

import { PLUGIN_ID } from "../pluginId";

const hasStoredType = <T extends boolean | number>(
  value: unknown,
  fallback: T,
): value is T => typeof value === typeof fallback;

const readStoredValue = <T extends boolean | number>(
  key: string,
  fallback: T,
): T => {
  try {
    const stored = globalThis.localStorage.getItem(key);

    const parsed: unknown = stored === null ? undefined : JSON.parse(stored);
    return hasStoredType(parsed, fallback) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

/** Persist preview preferences, retaining in-memory state when storage is unavailable. */
const usePersistentState = <T extends boolean | number>(
  name: string,
  initialValue: T,
): readonly [T, (nextValue: T) => void] => {
  const key = `${PLUGIN_ID}:${name}`;
  const [value, setValue] = useState<T>(() =>
    readStoredValue(key, initialValue),
  );
  const setPersistentValue = useCallback(
    (nextValue: T) => {
      setValue(nextValue);

      try {
        globalThis.localStorage.setItem(key, JSON.stringify(nextValue));
      } catch {
        // The preference still applies until the page is left.
      }
    },
    [key],
  );

  return [value, setPersistentValue];
};

export { usePersistentState };
