import type { JSONSchema } from "./schemas";

const maxDepth = 8;

function resolve(
  schema: JSONSchema | undefined,
  components: Record<string, JSONSchema>,
): JSONSchema | undefined {
  let current = schema;
  for (let hops = 0; current && hops < maxDepth; hops++) {
    const ref = current.$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/components/schemas/"))
      return current;
    current = components[decodeURIComponent(ref.slice(21))];
  }
  return current;
}

/** The first branch that is not `null`, for nullable `anyOf` and `type` arrays. */
function nonNull(
  schema: JSONSchema,
  components: Record<string, JSONSchema>,
): JSONSchema {
  const branches = (schema.anyOf ?? schema.oneOf) as JSONSchema[] | undefined;
  if (Array.isArray(branches)) {
    const branch = branches
      .map((item) => resolve(item, components))
      .find((item) => item && item.type !== "null");
    if (branch) return nonNull(branch, components);
  }
  return schema;
}

/** A placeholder value that satisfies the schema's type and basic bounds. */
export function exampleValue(
  schema: JSONSchema | undefined,
  components: Record<string, JSONSchema>,
  depth = 0,
): unknown {
  const resolved = resolve(schema, components);
  if (!resolved || depth > maxDepth) return null;
  const value = nonNull(resolved, components);
  if (value.default !== undefined) return value.default;
  if (Array.isArray(value.enum) && value.enum.length) return value.enum[0];
  if (value.const !== undefined) return value.const;
  const type = Array.isArray(value.type)
    ? (value.type as unknown[]).find((item) => item !== "null")
    : value.type;
  switch (type) {
    case "string": {
      if (value.format === "date-time") return "2026-01-01T00:00:00.000Z";
      if (value.format === "date") return "2026-01-01";
      if (value.format === "email") return "name@example.com";
      const min = typeof value.minLength === "number" ? value.minLength : 0;
      return "Example".padEnd(min, "!");
    }
    case "integer":
    case "number":
      return typeof value.minimum === "number" ? value.minimum : 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object": {
      // An object without required properties gets one, not `{}`.
      const full = exampleObject(
        value,
        components,
        false,
        new Set(),
        depth + 1,
      );
      return Object.keys(full).length
        ? full
        : exampleObject(value, components, true, new Set(), depth + 1);
    }
    default:
      return null;
  }
}

/** The required property names of an object schema. */
export function requiredKeys(
  schema: JSONSchema | undefined,
  components: Record<string, JSONSchema>,
): ReadonlySet<string> {
  const resolved = resolve(schema, components);
  return new Set(
    Array.isArray(resolved?.required) ? (resolved.required as string[]) : [],
  );
}

/**
 * An object with its required properties. With `partial`, one property
 * instead: an optional one not in `avoid` (so an update example differs from
 * the create example where it can), preferring one whose example is not an
 * empty object or array.
 */
export function exampleObject(
  schema: JSONSchema | undefined,
  components: Record<string, JSONSchema>,
  partial: boolean,
  avoid: ReadonlySet<string> = new Set(),
  depth = 0,
): Record<string, unknown> {
  const resolved = resolve(schema, components);
  const properties = (resolved?.properties ?? {}) as Record<string, JSONSchema>;
  const required = new Set(
    Array.isArray(resolved?.required) ? (resolved.required as string[]) : [],
  );
  const keys = Object.keys(properties);
  const value = (key: string) =>
    exampleValue(properties[key], components, depth + 1);
  if (!partial)
    return Object.fromEntries(
      keys.filter((key) => required.has(key)).map((key) => [key, value(key)]),
    );
  const isEmpty = (example: unknown) =>
    example !== null &&
    typeof example === "object" &&
    Object.keys(example).length === 0;
  const optional = keys.filter((key) => !required.has(key));
  const candidates = [
    ...optional.filter((key) => !avoid.has(key)),
    ...optional.filter((key) => avoid.has(key)),
    ...keys,
  ];
  const key =
    candidates.find((candidate) => !isEmpty(value(candidate))) ?? candidates[0];
  return key === undefined ? {} : { [key]: value(key) };
}
