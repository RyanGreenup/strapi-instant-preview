/**
 * KNOWN UNSOUNDNESS, kept on purpose and isolated here.
 *
 * Strapi validates integer, float and decimal input fields with a non-strict
 * `yup.number()` (packages/core/core/src/services/entity-validator/validators.ts,
 * `integerValidator` and `floatValidator`). Yup casts a numeric string such as
 * "12" to 12 before it checks the value, so Strapi accepts it and stores a
 * number. The contract still types these fields as `number`, so generated
 * clients send numbers. A request body with a numeric string is therefore
 * valid for Strapi but rejected by the contract.
 *
 * Instead of widening every client type to `number | string`, the input schema
 * carries `x-strapi-coerces-numeric-string: true`. A request validator can read
 * it and accept numeric strings.
 *
 * `tests/api.test.cjs` ("numeric fields accept numeric strings") checks that
 * Strapi still casts. To remove the extension, set the flag below to false and
 * update the unit test that checks the extension.
 */
import type { ZodType } from "zod/v4";

import type { SchemaRegistry } from "./modifiers";

export const COERCE_NUMERIC_STRINGS_EXTENSION = true;

export const coercesNumericStringKey = "x-strapi-coerces-numeric-string";

const numericTypes = new Set(["integer", "float", "decimal"]);

/** Marks the input schema of an integer, float or decimal attribute. Returns the schema unchanged otherwise. */
export function markCoercesNumericString<T extends ZodType>(
  registry: SchemaRegistry,
  type: string,
  schema: T,
): T {
  if (!COERCE_NUMERIC_STRINGS_EXTENSION || !numericTypes.has(type))
    return schema;
  registry.add(schema, {
    ...registry.get(schema),
    [coercesNumericStringKey]: true,
  });
  return schema;
}
