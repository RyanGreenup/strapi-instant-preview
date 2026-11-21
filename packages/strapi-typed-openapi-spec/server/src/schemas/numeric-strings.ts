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
 * carries `x-strapi-coerces-numeric-string: true` and a description that says
 * the same for readers that ignore extensions. A request validator can read the
 * extension, cast only the marked fields, and then apply the schema's bounds to
 * the cast number, as Strapi does. Do not add an unbounded string alternative.
 *
 * `tests/api.test.cjs` ("numeric fields accept numeric strings") checks that
 * Strapi still casts. To remove the extension, set the flag below to false and
 * update the unit test that checks the extension.
 */
import type { ZodType } from "zod/v4";

import type { SchemaRegistry } from "./modifiers";

export const COERCE_NUMERIC_STRINGS_EXTENSION = true;

export const coercesNumericStringKey = "x-strapi-coerces-numeric-string";

/** Human-readable form of the extension, for consumers that do not read it. */
export const coercesNumericStringDescription =
  "Send a JSON number. Strapi also accepts a numeric string and casts it before it checks the type and range " +
  `(${coercesNumericStringKey}); generic JSON Schema validation does not apply that cast.`;

const numericTypes = new Set(["integer", "float", "decimal"]);

/** Marks the input schema of an integer, float or decimal attribute. Returns the schema unchanged otherwise. */
export function markCoercesNumericString<T extends ZodType>(
  registry: SchemaRegistry,
  type: string,
  schema: T,
): T {
  if (!COERCE_NUMERIC_STRINGS_EXTENSION || !numericTypes.has(type))
    return schema;
  const meta = registry.get(schema);
  registry.add(schema, {
    ...meta,
    description: meta?.description
      ? `${meta.description} ${coercesNumericStringDescription}`
      : coercesNumericStringDescription,
    [coercesNumericStringKey]: true,
  });
  return schema;
}
