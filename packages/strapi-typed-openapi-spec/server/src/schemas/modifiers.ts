import type { core, ZodType } from "zod/v4";

export type SchemaRegistry = core.$ZodRegistry<{
  id?: string;
  description?: string;
  default?: unknown;
  allOf?: Record<string, unknown>[];
  "x-strapi-coerces-numeric-string"?: true;
  "x-strapi-regex"?: string;
  "x-strapi-conditions"?: Record<string, unknown>;
}>;

export function asResponseField(schema: ZodType) {
  return schema.nullable().optional();
}

/** Records a default for OpenAPI without supplying that value at parse time. */
export function withDefaultMeta(
  registry: SchemaRegistry,
  schema: ZodType,
  value: unknown,
) {
  return schema.optional().register(registry, { default: value });
}

/** Converts nonblank strings with `Number` before it checks for a finite number. */
export function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "string" && value.trim() !== "") value = Number(value);
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
