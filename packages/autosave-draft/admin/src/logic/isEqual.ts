import { isPlainObject } from "./isPlainObject";

/**
 * Compare form values recursively, treating null, undefined and missing keys as equivalent.
 * Cleared fields use null in the form and undefined in fetched document values.
 */
export const isEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((item, index) => isEqual(item, b[index]))
    );
  }

  if (!isPlainObject(a) || !isPlainObject(b)) {
    return false;
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  return [...keys].every((key) => isEqual(a[key], b[key]));
};

/** Return the top-level keys with different form values. */
export const changedKeys = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): string[] => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  return [...keys].filter((key) => !isEqual(a[key], b[key]));
};
