import type { ZodType } from "zod/v4";

import type { Attribute, Zod } from "../adapter";
import type { SchemaRegistry } from "../schemas/modifiers";
import type { ModelFields } from "./model-fields";

import { attributeType } from "../schemas/scalars";

type Shape = Record<string, ZodType>;

const integerText = /^\s*[+-]?\d+\s*$/;
const numberText =
  /^\s*(?:[+-]?(?:\d{1,200}(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d{1,2})?|0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+)\s*$/;
const timestampText = /^-?\d{1,15}$/;
const maxTimestamp = 8.64e15;
const timeText = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/;

function uidToken(uid: string) {
  return uid.replace(
    /[^a-zA-Z0-9.-]/gu,
    (char) => `_${char.codePointAt(0)!.toString(16)}_`,
  );
}

/**
 * Supplies a cached, model-specific `filters` schema for top-level and `populate` queries.
 * The schemas accept native operands and supported query-string forms.
 * They follow known relation, component, and media targets.
 * They omit private attributes and polymorphic targets.
 * If the UID is unknown, the returned function throws.
 */
export function createFilters(
  z: Zod,
  catalog: ModelFields,
  registry: SchemaRegistry,
): (uid: string) => ZodType {
  const filters = new Map<string, ZodType>();
  const relations = new Map<string, ZodType>();
  const fields = new Map<string, Shape>();
  const scalarFilters = new Map<string, ZodType>();
  const text = z.string();
  const integer = z.union([z.number().int(), text.regex(integerText)]);
  const booleanNumber = z.literal([0, 1]);
  const nullFlag = z.union([
    z.boolean(),
    booleanNumber,
    z.enum(["true", "false", "t", "f", "0", "1"]),
  ]);

  function named<T extends ZodType>(schema: T, name: string): T {
    registry.add(schema, { id: `StrapiQueryFilter_${name}Input` });
    return schema;
  }

  function scalarOps(value: ZodType, textOps: boolean) {
    const direct = z.union([value, z.array(value)]);
    const insensitive = textOps ? z.union([text, z.array(text)]) : direct;
    const pattern = textOps ? z.union([text, z.array(text)]) : undefined;
    const operators: Shape = {
      $eq: direct,
      $ne: direct,
      $eqi: insensitive,
      $nei: insensitive,
      $gt: direct,
      $gte: direct,
      $lt: direct,
      $lte: direct,
      $in: direct,
      $notIn: direct,
      $between: z.array(value).length(2),
      $null: nullFlag,
      $notNull: nullFlag,
      ...(pattern && {
        $startsWith: pattern,
        $endsWith: pattern,
        $startsWithi: pattern,
        $endsWithi: pattern,
        $contains: pattern,
        $notContains: pattern,
        $containsi: pattern,
        $notContainsi: pattern,
      }),
    };
    return { direct, operators };
  }

  const idShortcut = scalarOps(integer, false);
  const relationId = named(
    z.union([
      idShortcut.direct,
      ...Object.entries({
        ...idShortcut.operators,
        $not: idShortcut.direct,
      }).map(([key, schema]) => z.strictObject({ [key]: schema })),
    ]),
    "RelationId",
  );

  function scalar(attribute: Attribute): ZodType | undefined {
    const type = attributeType(attribute);
    const values = attribute.enum;
    if (
      type === "enumeration" &&
      (!Array.isArray(values) ||
        !values.length ||
        values.some((value) => typeof value !== "string"))
    ) {
      return;
    }
    const key =
      type === "enumeration"
        ? `${type}_${uidToken(JSON.stringify(values))}`
        : type;
    const cached = scalarFilters.get(key);
    if (cached) return cached;

    let value: ZodType;
    let textOps = false;
    switch (type) {
      case "string":
      case "text":
      case "richtext":
      case "email":
      case "uid":
        value = text;
        textOps = true;
        break;
      case "enumeration":
        value = z.enum(values as string[]);
        textOps = true;
        break;
      case "increments":
      case "integer":
      case "biginteger":
        value = integer;
        break;
      case "float":
      case "decimal":
        value = z.union([z.number(), text.regex(numberText)]);
        break;
      case "boolean":
        value = z.union([
          z.boolean(),
          booleanNumber,
          text.regex(
            /^(?:[tT](?:[rR][uU][eE])?|[fF](?:[aA][lL][sS][eE])?|[01])$/,
          ),
        ]);
        break;
      case "date":
        value = z.iso.date();
        break;
      case "datetime":
      case "timestamp":
        value = z.union([
          text.regex(z.core.regexes.datetime({ offset: true, local: true })),
          z.iso.date(),
          z.number().int().min(-maxTimestamp).max(maxTimestamp),
          text.regex(timestampText),
        ]);
        break;
      case "time":
        value = text.regex(timeText);
        break;
      case "json":
      case "blocks":
        value = z.union([text, z.number(), z.boolean()]);
        break;
      default:
        return;
    }
    const { direct, operators } = scalarOps(value, textOps);
    const predicate: ZodType = named(
      z.union([
        direct,
        z.strictObject({
          ...Object.fromEntries(
            Object.entries(operators).map(([key, schema]) => [
              key,
              schema.optional(),
            ]),
          ),
          $not: z.lazy(() => predicate).optional(),
        }),
      ]),
      `Scalar_${key}`,
    );
    scalarFilters.set(key, predicate);
    return predicate;
  }

  function relation(uid: string): ZodType {
    const cached = relations.get(uid);
    if (cached) return cached;
    const items = z.array(z.lazy(() => filter(uid)));
    const schema = named(
      z.union([
        z.strictObject(modelFields(uid)),
        z.strictObject({ $and: items }),
        z.strictObject({ $or: items }),
        relationId,
      ]),
      `Relation_${uidToken(uid)}`,
    );
    relations.set(uid, schema);
    return schema;
  }

  function modelFields(uid: string): Shape {
    const cached = fields.get(uid);
    if (cached) return cached;
    const { model, isContentType, attributes, isPrivate } = catalog.get(uid);
    if (!model)
      throw new Error(`Cannot build filters for unknown Strapi model ${uid}`);
    const shape: Shape = Object.create(null);
    function addScalar(key: string, attribute: Attribute) {
      const predicate = scalar(attribute);
      if (predicate) shape[key] = predicate.optional();
    }
    if (!Object.hasOwn(model.attributes, "id") && !isPrivate("id"))
      addScalar("id", { type: "increments" });
    if (
      isContentType &&
      !Object.hasOwn(model.attributes, "documentId") &&
      !isPrivate("documentId")
    ) {
      addScalar("documentId", { type: "string" });
    }
    for (const {
      name,
      attribute,
      private: hidden,
      target,
      polymorphic,
    } of attributes) {
      if (
        hidden ||
        polymorphic ||
        attribute.type === "dynamiczone" ||
        attributeType(attribute) === "password"
      )
        continue;
      if (
        attribute.type === "relation" &&
        typeof attribute.relation !== "string"
      )
        continue;
      if (target !== undefined)
        shape[name] = z.lazy(() => relation(target)).optional();
      else addScalar(name, attribute);
    }
    fields.set(uid, shape);
    return shape;
  }

  function filter(uid: string): ZodType {
    const cached = filters.get(uid);
    if (cached) return cached;
    const self = z.lazy(() => filter(uid));
    const group = z.array(self).optional();
    const schema = named(
      z.strictObject({
        ...modelFields(uid),
        $and: group,
        $or: group,
        $not: self.optional(),
      }),
      `Model_${uidToken(uid)}`,
    );
    filters.set(uid, schema);
    return schema;
  }

  return filter;
}
