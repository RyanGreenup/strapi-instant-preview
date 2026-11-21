import type { ZodType } from "zod/v4";

import type { Attribute, Zod } from "../adapter";

import { finiteNumber, type SchemaRegistry } from "./modifiers";
import { portablePattern } from "./regex";

const integerString = /^-?\d+$/;
const bigintInput = /^\s*[+-]?\d+\s*$/;
const uidInput = /^[A-Za-z0-9-_.~]*$/;
const timeResponse = /^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/;
const timeInput = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/;

/** If a custom field has a string `baseType`, that type takes precedence over `type`. */
export function attributeType(attribute: Attribute): string {
  if (
    attribute.type === "customField" &&
    typeof attribute.baseType === "string"
  ) {
    return attribute.baseType;
  }
  return attribute.type;
}

export type ScalarMode =
  | "response"
  | "validated-response"
  | "published-response"
  | "draft"
  | "published"
  | "unchecked-input"
  | "unchecked-response";

const varcharTypes = new Set([
  "string",
  "password",
  "email",
  "uid",
  "enumeration",
]);

/**
 * Builds the value schema before the caller applies field presence and defaults.
 *
 * @param unknown - Supplies the fallback schema for unsupported attribute types or invalid definitions.
 */
export function scalar(
  z: Zod,
  attribute: Attribute,
  // 'validated-response': the rules Strapi checks on every write (drafts included).
  // 'published-response': those plus the lower bounds Strapi checks only on published
  // writes (minLength, min). Format rules (regex, email, uid) stay input-only: a stored
  // value is not re-checked when a rule is added later, and yup and JSON Schema read
  // email and regex rules differently.
  // 'unchecked-input' / 'unchecked-response': a field that `conditions.visible` can hide.
  // Strapi skips every rule of a hidden field (entity-validator createAttributeValidator),
  // so only the type and the column size remain: string, email, uid, password and
  // enumeration columns are varchar(255) (database schema.ts), and a hidden enumeration
  // stores any such string.
  mode: ScalarMode,
  unknown: (reason: string) => ZodType,
  registry?: SchemaRegistry,
): ZodType {
  const unchecked = mode === "unchecked-input" || mode === "unchecked-response";
  const input =
    mode === "draft" || mode === "published" || mode === "unchecked-input";
  const published = mode === "published";
  const lowerBounds = published || mode === "published-response";
  const type = attributeType(attribute);
  if (
    unchecked &&
    (varcharTypes.has(type) || type === "text" || type === "richtext")
  ) {
    if (
      type === "enumeration" &&
      (!Array.isArray(attribute.enum) ||
        !attribute.enum.length ||
        !attribute.enum.every((v) => typeof v === "string"))
    )
      return unknown("invalid enumeration");
    return input && varcharTypes.has(type) ? z.string().max(255) : z.string();
  }
  switch (type) {
    case "string":
    case "text":
    case "richtext":
    case "password":
    case "email":
    case "uid": {
      if (mode === "response") return z.string();
      let schema = type === "email" && published ? z.email() : z.string();
      const min = attribute.minLength;
      const max = attribute.maxLength ?? (type === "string" ? 255 : undefined);
      if (lowerBounds && typeof min === "number" && Number.isInteger(min))
        schema = schema.min(min);
      if (typeof max === "number" && Number.isInteger(max))
        schema = schema.max(max);
      if (
        published &&
        (typeof attribute.regex === "string" ||
          attribute.regex instanceof RegExp)
      ) {
        let regex: RegExp;
        try {
          regex = new RegExp(attribute.regex);
        } catch {
          return unknown("invalid regex");
        }
        const source = regex.source;
        // Strapi skips the pattern for "" on an optional field (yup excludeEmptyString),
        // except on a uid field, whose uidValidator applies the pattern again without it.
        const skipEmpty = attribute.required !== true && type !== "uid";
        if (portablePattern(source) && !regex.flags) {
          schema = schema.regex(skipEmpty ? new RegExp(`^$|${source}`) : regex);
        } else {
          // JSON Schema would read this pattern differently: check it in Zod only and
          // carry the source as metadata (see regex.ts).
          schema = schema.refine(
            (value) =>
              (skipEmpty && value === "") || new RegExp(regex).test(value),
            { message: `must match ${source}` },
          );
          registry?.add(schema, {
            ...registry.get(schema),
            "x-strapi-regex": source,
          });
        }
      } else if (published && type === "uid") {
        schema = schema.regex(uidInput);
      }
      return schema;
    }
    case "enumeration": {
      const values = attribute.enum;
      if (
        !Array.isArray(values) ||
        !values.length ||
        !values.every((v) => typeof v === "string")
      ) {
        return unknown("invalid enumeration");
      }
      return z.enum(values as string[]);
    }
    case "integer":
    case "float":
    case "decimal": {
      let schema = type === "integer" ? z.number().int() : z.number();
      if (
        !unchecked &&
        (input ||
          mode === "validated-response" ||
          mode === "published-response")
      ) {
        const min = finiteNumber(attribute.min);
        const max = finiteNumber(attribute.max);
        if (lowerBounds && min !== undefined)
          schema = schema.min(type === "integer" ? Math.trunc(min) : min);
        if (max !== undefined)
          schema = schema.max(type === "integer" ? Math.trunc(max) : max);
      }
      return schema;
    }
    case "biginteger":
      return input
        ? z.union([z.string().regex(bigintInput), z.number().int()])
        : z.string().regex(integerString);
    case "boolean":
      return z.boolean();
    case "date":
      return z.iso.date();
    case "datetime":
      return input ? z.iso.datetime({ offset: true }) : z.iso.datetime();
    case "time":
      return z.string().regex(input ? timeInput : timeResponse);
    case "timestamp":
      return z.string().regex(integerString);
    case "json":
      return z.unknown();
    default:
      return unknown(`unsupported attribute type ${JSON.stringify(type)}`);
  }
}
