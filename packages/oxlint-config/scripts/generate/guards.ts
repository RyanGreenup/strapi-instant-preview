/** Narrow `value` to a plain string-keyed object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrow `value` to an array whose elements are still unknown. */
export function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** Parse `text` as JSON without pretending to know its shape. */
export function parseJson(text: string): unknown {
  return JSON.parse(text);
}
