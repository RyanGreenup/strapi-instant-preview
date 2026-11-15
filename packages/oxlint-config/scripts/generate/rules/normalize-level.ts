import { isUnknownArray } from "../guards.ts";

const levelNames: Readonly<Record<number, string>> = {
  0: "off",
  1: "warn",
  2: "error",
};

/** Rewrites ESLint's numeric severities to Oxlint's string names. */
export function normalizeLevel(entry: unknown): unknown {
  if (typeof entry === "number") {
    return levelNames[entry] ?? entry;
  }

  if (isUnknownArray(entry)) {
    const [level, ...options] = entry;
    return [normalizeLevel(level), ...options];
  }

  return entry;
}
