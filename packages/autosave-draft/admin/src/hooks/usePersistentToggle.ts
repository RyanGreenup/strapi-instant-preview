import { useCallback, useState } from "react";

const read = (key: string, fallback: boolean): boolean => {
  try {
    const raw = globalThis.localStorage.getItem(key);

    return raw === null ? fallback : raw === "true";
  } catch {
    // Browser settings may block storage. Use the default for this visit.
    return fallback;
  }
};

/**
 * Persist a boolean in localStorage.
 *
 * @param fallback - Value used when no choice is stored or storage is unavailable.
 */
export const usePersistentToggle = (
  key: string,
  fallback: boolean,
): [boolean, (next: boolean) => void] => {
  const [value, setValue] = useState(() => read(key, fallback));

  const update = useCallback(
    (next: boolean) => {
      setValue(next);

      try {
        globalThis.localStorage.setItem(key, String(next));
      } catch {
        // The choice still applies until the page is left.
      }
    },
    [key],
  );

  return [value, update];
};
