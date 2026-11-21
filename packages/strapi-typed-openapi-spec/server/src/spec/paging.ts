import type { ZodType } from "zod/v4";

import type { Zod } from "../adapter";
import type { SchemaRegistry } from "../schemas/modifiers";
import type { ModelFields } from "./model-fields";

function createPagination(z: Zod): ZodType {
  const positive = z.union([
    z.int().positive().max(999_999_999),
    z.string().regex(/^0*[1-9][0-9]{0,8}$/),
  ]);
  const start = z.union([
    z.int().nonnegative(),
    z.string().regex(/^0*[0-9]{1,18}$/),
  ]);
  const limit = z.union([
    z.int().min(-1),
    z.string().regex(/^(?:-0*1|0*[0-9]{1,18})$/),
  ]);
  const withCount = z
    .union([
      z.boolean(),
      z.enum(["true", "false", "t", "f", "1", "0"]),
      z.literal([0, 1]),
    ])
    .describe("Include total count in the response")
    .optional();
  return z
    .union([
      z.strictObject({
        page: positive.describe("Page number (1-based)").optional(),
        pageSize: positive.describe("Number of entries per page").optional(),
        withCount,
      }),
      z.strictObject({
        start: start.describe("Number of entries to skip").optional(),
        limit: limit
          .describe(
            "Maximum entries to return; -1 requests the configured maximum",
          )
          .optional(),
        withCount,
      }),
    ])
    .describe("Use page/pageSize or start/limit, not both")
    .optional();
}

type SortFields = { names: Set<string>; nested: Map<string, string> };

const alternatives = (patterns: string[]) =>
  patterns.length === 1 ? patterns[0] : `(?:${patterns.join("|")})`;
const escapeRegex = (name: string) =>
  name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const direction = "(?:[aA][sS][cC]|[dD][eE][sS][cC])";

/**
 * Returns an unanchored regex fragment for dot paths that follow `nested` links and end at a field in `names`.
 * Paths can revisit models. If no path can end at a field, the fragment matches nothing.
 */
export function pathPattern(
  root: string,
  getFields: (uid: string) => SortFields,
): string {
  const reachable = new Set([root]);
  const paths = new Map<string, Map<string | null, string>>();
  for (const uid of reachable) {
    const { names, nested } = getFields(uid);
    const outgoing = new Map<string | null, string>();
    paths.set(uid, outgoing);
    if (names.size)
      outgoing.set(null, alternatives([...names].map(escapeRegex)));
    for (const [name, target] of nested) {
      reachable.add(target);
      addPath(outgoing, target, `${escapeRegex(name)}\\.`);
    }
  }
  for (const through of [...reachable].reverse()) {
    if (through === root) continue;
    const exits = paths.get(through)!;
    const repeat = repeated(exits.get(through));
    exits.delete(through);
    paths.delete(through);
    for (const outgoing of paths.values()) {
      const enter = outgoing.get(through);
      if (enter === undefined) continue;
      outgoing.delete(through);
      for (const [target, exit] of exits)
        addPath(outgoing, target, enter + repeat + exit);
    }
  }
  const outgoing = paths.get(root)!;
  const finish = outgoing.get(null);
  return finish === undefined ? "(?!)" : repeated(outgoing.get(root)) + finish;
}

function repeated(pattern: string | undefined): string {
  return pattern === undefined ? "" : `(?:${pattern})*`;
}

function addPath(
  paths: Map<string | null, string>,
  target: string | null,
  pattern: string,
) {
  const previous = paths.get(target);
  paths.set(
    target,
    previous === undefined ? pattern : alternatives([previous, pattern]),
  );
}

/**
 * Supplies optional pagination and sort schemas for Strapi query inputs.
 * Pagination accepts partial page or offset inputs, but not a mix.
 * Top-level sort accepts nested paths. Sort inside `populate` accepts only direct fields.
 * An unknown UID has no sortable fields.
 */
export function createPaging(
  z: Zod,
  catalog: ModelFields,
  registry?: SchemaRegistry,
): {
  pagination: ZodType;
  sort(uid: string): ZodType;
  populateSort(uid: string): ZodType;
} {
  const pagination = createPagination(z);
  registry?.add(pagination, { id: "StrapiQuery.PaginationInput" });
  const order = z
    .string()
    .regex(new RegExp(`^\\s*${direction}\\s*$`))
    .optional();
  const fields = new Map<string, SortFields>();
  const objects = new Map<string, ZodType>();
  const nestedObjects = new Map<string, ZodType>();
  const sorts = new Map<string, ZodType>();
  const populateSorts = new Map<string, ZodType>();

  function register(schema: ZodType, kind: string, uid: string) {
    const key = uid.replace(
      /[^a-zA-Z0-9.-]/gu,
      (char) => `_${char.codePointAt(0)!.toString(16)}_`,
    );
    registry?.add(schema, { id: `StrapiQuery.${kind}.${key}Input` });
  }

  function getFields(uid: string): SortFields {
    const existing = fields.get(uid);
    if (existing) return existing;
    const { model, isContentType, attributes } = catalog.get(uid);
    const names = new Set<string>();
    const nested = new Map<string, string>();
    if (model) {
      names.add("id");
      if (isContentType) names.add("documentId");
      for (const {
        name,
        attribute,
        private: isPrivate,
        target,
        polymorphic,
      } of attributes) {
        if (
          isPrivate ||
          attribute.type === "password" ||
          attribute.type === "dynamiczone" ||
          polymorphic
        ) {
          names.delete(name);
          continue;
        }
        if (target !== undefined) nested.set(name, target);
        else if (
          attribute.type !== "relation" &&
          attribute.type !== "component" &&
          attribute.type !== "media"
        ) {
          names.add(name);
        }
      }
    }
    const result = { names, nested };
    fields.set(uid, result);
    return result;
  }

  function sortObject(uid: string): ZodType {
    const existing = objects.get(uid);
    if (existing) return existing;
    const { names, nested } = getFields(uid);
    const shape: Record<string, ZodType> = Object.create(null);
    for (const name of names) shape[name] = order;
    for (const [name, target] of nested) {
      let model = nestedObjects.get(target);
      if (!model) {
        model = z.lazy(() => sortObject(target)).optional();
        nestedObjects.set(target, model);
      }
      shape[name] = model;
    }
    const result = z.strictObject(shape);
    register(result, "SortObject", uid);
    objects.set(uid, result);
    return result;
  }

  function sort(uid: string): ZodType {
    const existing = sorts.get(uid);
    if (existing) return existing;
    const names = [...getFields(uid).names].map(escapeRegex);
    const plain = names.length
      ? `${alternatives(names)}(?::\\s*${direction})?|`
      : "";
    const item = `(?:${plain}(?:${pathPattern(uid, getFields)})(?::${direction})?)\\s*`;
    const text = z
      .string()
      .regex(new RegExp(`^[\\s,]*(?:${item}(?:,[\\s,]*|$))*$`))
      .describe(
        "Field or dot path with optional :asc or :desc. Multiple sort keys can be separated by commas.",
      );
    register(text, "SortPath", uid);
    const object = sortObject(uid);
    const result = z
      .union([text, z.array(text), object, z.array(object)])
      .describe("Sort the result")
      .optional();
    register(result, "Sort", uid);
    sorts.set(uid, result);
    return result;
  }

  function populateSort(uid: string): ZodType {
    const existing = populateSorts.get(uid);
    if (existing) return existing;
    const { names } = getFields(uid);
    const escaped = [...names].map(escapeRegex);
    const item = escaped.length
      ? `${alternatives(escaped)}(?::\\s*${direction})?\\s*`
      : "(?!)";
    const text = z
      .string()
      .regex(new RegExp(`^[\\s,]*(?:${item}(?:,[\\s,]*|$))*$`))
      .describe(
        "Field with optional :asc or :desc. Multiple sort keys can be separated by commas.",
      );
    register(text, "PopulateSortPath", uid);
    const object = z.strictObject(
      Object.fromEntries([...names].map((name) => [name, order])),
    );
    register(object, "PopulateSortObject", uid);
    const result = z
      .union([text, z.array(text), object, z.array(object)])
      .describe("Sort the populated entries")
      .optional();
    register(result, "PopulateSort", uid);
    populateSorts.set(uid, result);
    return result;
  }

  return { pagination, sort, populateSort };
}
