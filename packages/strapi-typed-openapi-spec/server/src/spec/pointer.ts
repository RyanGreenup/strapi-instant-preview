// Encode one reference token for use inside a local URI fragment.
export function pointerToken(token: string): string {
  return encodeURIComponent(token.replaceAll("~", "~0").replaceAll("/", "~1"));
}

/**
 * Decodes URI and JSON Pointer escapes within each token.
 * `#` returns an empty path. Malformed or nonlocal references return `undefined`.
 */
export function parseLocalPointer(ref: string): string[] | undefined {
  if (ref === "#") return [];
  if (!ref.startsWith("#/")) return undefined;
  const tokens: string[] = [];
  try {
    for (const encoded of ref.slice(2).split("/")) {
      const token = decodeURIComponent(encoded);
      if (/~(?![01])/.test(token)) return undefined;
      tokens.push(token.replaceAll("~1", "/").replaceAll("~0", "~"));
    }
  } catch {
    return undefined; // Malformed URI escape.
  }
  return tokens;
}

/**
 * Resolves `#` against `hashRoot` and other local pointers against `document`.
 * Only own properties count. A missing or invalid pointer returns `undefined`, distinct from a target such as `false`.
 */
export function resolveLocalPointer(
  document: unknown,
  ref: string,
  hashRoot: unknown = document,
): unknown {
  if (ref === "#") return hashRoot;
  const tokens = parseLocalPointer(ref);
  if (!tokens) return undefined;
  let value = document;
  for (const key of tokens) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key)
    )
      return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
