import type { Model } from "../adapter";

import { relationCount, type RelationStorage } from "./relation-count";
import { attributeType } from "./scalars";

/**
 * Which keys a response object has for one request. Strapi sends every
 * non-private scalar unless `fields` selects some, and sends a relation, media,
 * component or dynamic zone key only when `populate` asks for it.
 */
export type Presence = {
  /** Selected scalar fields. Undefined means every scalar is sent. */
  fields?: ReadonlySet<string>;
  /** Populated keys. A relational key that is not listed is absent. */
  populate: ReadonlyMap<string, Populated>;
};
/**
 * `target` is the related content type of a regular (not polymorphic)
 * relation. Strapi drops such a key when the caller cannot `find` the target.
 * `count-or-nested` is a count request on a relation whose storage is unknown:
 * Strapi sends a count from a join table and the document from a join column.
 */
export type Populated = { target?: string } & (
  | { kind: "count" }
  | { kind: "count-or-nested"; plan: Presence }
  | { kind: "nested"; plan: Presence }
  | { kind: "zone"; on: ReadonlyMap<string, Presence> }
);
export type Pagination = { style: "page" | "offset"; withCount: boolean };
export type RequestPlan = {
  root: Presence;
  /**
   * The requested status. On a model with draft and publish, `draft` keeps
   * required fields nullable and `published` makes some non-null. A model
   * without draft and publish always reads as published.
   */
  status: "draft" | "published";
  pagination: Pagination;
};

type PresenceModels = {
  contentTypes: Record<string, Model>;
  components: Record<string, Model>;
  relationStorage?: RelationStorage;
};
type Raw = Record<string, unknown>;

const fileUid = "plugin::upload.file";
const relational = new Set(["relation", "media", "component", "dynamiczone"]);
const nestedKeys = new Set([
  "fields",
  "populate",
  "filters",
  "sort",
  "count",
  "on",
  "status",
  "locale",
]);
const empty: Presence = { populate: new Map() };
const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Raw =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isTrue = (value: unknown) =>
  value === true || value === "true" || value === "*";
const isFalse = (value: unknown) => value === false || value === "false";

/** Thrown inside the parser for a query shape it does not model. */
class Unsupported extends Error {}
function unsupported(): never {
  throw new Unsupported();
}

/**
 * Reads `fields`, `populate`, `status` and `pagination` from a parsed request
 * query. Returns undefined for any shape this parser does not model, so the
 * caller can fall back to the static response schema.
 *
 * The status defaults to `published` for reads and writes alike: the core
 * service sets it unless the query does (CoreService.getFetchParams), and a
 * published create or update returns the published entry. `withCount` is the
 * app's `api.rest.withCount` setting (default true).
 */
export function parsePresence(
  models: PresenceModels,
  uid: string,
  query: unknown,
  options: { withCount?: boolean } = {},
): RequestPlan | undefined {
  const model = hasOwn(models.contentTypes, uid)
    ? models.contentTypes[uid]
    : undefined;
  if (!model) return;
  const raw = query === undefined || query === null ? {} : query;
  if (!record(raw)) return;
  try {
    const root = level(models, uid, model, raw.fields, raw.populate);
    return {
      root,
      status: status(raw.status),
      pagination: pagination(raw.pagination, options.withCount ?? true),
    };
  } catch (error) {
    if (error instanceof Unsupported) return;
    throw error;
  }
}

// The requested status applies to every populated document, so a model
// without draft and publish still passes `draft` on to its relations. Each
// model applies it only if it has draft and publish (see queryResponse).
function status(value: unknown): RequestPlan["status"] {
  if (value !== undefined && value !== "draft" && value !== "published")
    unsupported();
  return (value as RequestPlan["status"] | undefined) ?? "published";
}

// packages/core/core/src/core-api/service/pagination.ts: offset style when
// `start` or `limit` is set; `withCount` falls back to `api.rest.withCount`.
function pagination(value: unknown, defaultWithCount: boolean): Pagination {
  if (value === undefined)
    return { style: "page", withCount: defaultWithCount };
  if (!record(value)) unsupported();
  const page = hasOwn(value, "page") || hasOwn(value, "pageSize");
  const offset = hasOwn(value, "start") || hasOwn(value, "limit");
  if (page && offset) unsupported();
  let withCount = defaultWithCount;
  if (hasOwn(value, "withCount")) {
    const count = value.withCount;
    if (
      count === undefined ||
      count === false ||
      ["false", "f", "0", 0].includes(count as string)
    )
      withCount = false;
    else if (count === true || ["true", "t", "1", 1].includes(count as string))
      withCount = true;
    else unsupported();
  }
  return { style: offset ? "offset" : "page", withCount };
}

function names(value: unknown): string[] {
  const items =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value
        : unsupported();
  return items.flatMap((item) =>
    typeof item === "string"
      ? item
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : unsupported(),
  );
}

function fields(model: Model, value: unknown): ReadonlySet<string> | undefined {
  if (value === undefined) return;
  const list = names(value);
  if (list.includes("*")) return;
  for (const name of list) {
    if (name === "id" || name === "documentId") continue;
    const attribute = hasOwn(model.attributes, name)
      ? model.attributes[name]
      : undefined;
    if (!attribute || relational.has(attributeType(attribute))) unsupported();
  }
  return new Set(list);
}

function level(
  models: PresenceModels,
  uid: string,
  model: Model,
  rawFields: unknown,
  rawPopulate: unknown,
): Presence {
  return {
    fields: fields(model, rawFields),
    populate: populate(models, uid, model, rawPopulate),
  };
}

/** The regular relation targets a plan populates, at any depth, sorted. */
export function relationTargets(plan: RequestPlan): string[] {
  const found = new Set<string>();
  const visit = (presence: Presence) => {
    for (const populated of presence.populate.values()) {
      if (populated.target) found.add(populated.target);
      if (populated.kind === "zone")
        for (const on of populated.on.values()) visit(on);
      else if (populated.kind !== "count") visit(populated.plan);
    }
  };
  visit(plan.root);
  return [...found].sort();
}

function populatable(model: Model): string[] {
  return Object.entries(model.attributes)
    .filter(([, attribute]) => relational.has(attributeType(attribute)))
    .map(([key]) => key);
}

function populate(
  models: PresenceModels,
  uid: string,
  model: Model,
  value: unknown,
): Map<string, Populated> {
  const result = new Map<string, Populated>();
  if (value === undefined || value === null || isFalse(value)) return result;
  if (isTrue(value)) {
    for (const key of populatable(model))
      result.set(key, entry(models, uid, model, key, true));
    return result;
  }
  if (record(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (isFalse(nested)) continue;
      result.set(key, entry(models, uid, model, key, nested));
    }
    return result;
  }
  // Comma lists and arrays of dot paths: `a,b.c` populates a, b and b.c.
  const paths = names(value);
  if (paths.includes("*")) return populate(models, uid, model, "*");
  const grouped = new Map<string, string[]>();
  for (const path of paths) {
    const [head, ...rest] = path.split(".");
    const children = grouped.get(head) ?? [];
    if (rest.length) children.push(rest.join("."));
    grouped.set(head, children);
  }
  for (const [key, children] of grouped) {
    result.set(
      key,
      entry(
        models,
        uid,
        model,
        key,
        children.length ? { populate: children } : true,
      ),
    );
  }
  return result;
}

function target(
  models: PresenceModels,
  model: Model,
  key: string,
): { type: string; uid?: string; model?: Model; uids?: string[] } {
  const attribute = hasOwn(model.attributes, key)
    ? model.attributes[key]
    : unsupported();
  const type = attributeType(attribute);
  switch (type) {
    case "media":
      return {
        type,
        uid: fileUid,
        model: models.contentTypes[fileUid] ?? unsupported(),
      };
    case "component": {
      const uid = attribute.component;
      return {
        type,
        uid: uid as string,
        model:
          typeof uid === "string" && hasOwn(models.components, uid)
            ? models.components[uid]
            : unsupported(),
      };
    }
    case "dynamiczone": {
      const uids = attribute.components;
      if (
        !Array.isArray(uids) ||
        !uids.every(
          (uid) => typeof uid === "string" && hasOwn(models.components, uid),
        )
      )
        unsupported();
      return { type, uids: uids as string[] };
    }
    case "relation": {
      if (
        attribute.relation === "morphToOne" ||
        attribute.relation === "morphToMany"
      )
        return { type: "morph" };
      const uid = attribute.target;
      return {
        type,
        uid: uid as string,
        model:
          typeof uid === "string" && hasOwn(models.contentTypes, uid)
            ? models.contentTypes[uid]
            : unsupported(),
      };
    }
    default:
      return unsupported();
  }
}

function entry(
  models: PresenceModels,
  owner: string,
  model: Model,
  key: string,
  value: unknown,
): Populated {
  const found = target(models, model, key);
  const relation = found.type === "relation" ? { target: found.uid! } : {};
  const options = isTrue(value) ? {} : record(value) ? value : unsupported();
  for (const name of Object.keys(options))
    if (!nestedKeys.has(name)) unsupported();
  if (options.count !== undefined) {
    if (
      !isTrue(options.count) ||
      found.type === "media" ||
      Object.keys(options).length !== 1
    )
      unsupported();
    // A dynamic zone ignores `count` and sends its entries (seen on 5.62).
    if (found.type === "relation") {
      // A join-column relation ignores `count` and sends the document or null
      // (database populate/apply.ts, XtoOne); see relation-count.ts.
      const counts = relationCount(
        models.relationStorage,
        owner,
        key,
        model.attributes[key],
      );
      if (counts === "yes") return { ...relation, kind: "count" };
      const plan = level(
        models,
        found.uid!,
        found.model!,
        undefined,
        undefined,
      );
      return counts === "no"
        ? { ...relation, kind: "nested", plan }
        : { ...relation, kind: "count-or-nested", plan };
    }
    if (found.type !== "dynamiczone") return { kind: "count" };
  }
  if (found.type === "dynamiczone") {
    const on = new Map<string, Presence>();
    const fragments =
      options.on === undefined
        ? undefined
        : record(options.on)
          ? options.on
          : unsupported();
    for (const uid of found.uids!) {
      const component = models.components[uid];
      if (options.count !== undefined) {
        on.set(uid, empty);
      } else if (fragments) {
        // Components missing from `on` are still listed, with their scalars only.
        const fragment = hasOwn(fragments, uid) ? fragments[uid] : undefined;
        const raw =
          fragment === undefined || isTrue(fragment)
            ? {}
            : record(fragment)
              ? fragment
              : unsupported();
        on.set(uid, level(models, uid, component, raw.fields, raw.populate));
      } else {
        on.set(
          uid,
          level(models, uid, component, options.fields, options.populate),
        );
      }
    }
    return { kind: "zone", on };
  }
  if (options.on !== undefined) unsupported();
  // Polymorphic targets keep the static entry schema; only key presence matters.
  if (found.type === "morph") return { kind: "nested", plan: empty };
  return {
    ...relation,
    kind: "nested",
    plan: level(
      models,
      found.uid!,
      found.model!,
      options.fields,
      options.populate,
    ),
  };
}
