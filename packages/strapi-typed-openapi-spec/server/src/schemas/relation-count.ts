/**
 * Whether `populate[key][count]=true` returns `{ count }` for a relation.
 *
 * Strapi's database populate (packages/core/database/src/query/helpers/populate/apply.ts)
 * answers a count request only in its join-table branches. A relation stored
 * in a join column (`useJoinTable: false`) ignores `count` and sends the
 * related document, or null. The storage comes from the booted app's database
 * metadata, so the spec, the populate description and the query-mode checker
 * share this one decision.
 *
 * Only regular relations are decided here. Polymorphic relations, media,
 * components and dynamic zones keep their own rules until fixtures cover them.
 */
import type { Attribute } from "../adapter";

/** How the database stores a relation, from `strapi.db.metadata`. */
export type RelationStorage = (
  uid: string,
  key: string,
) => "join-table" | "join-column" | "unknown";

/**
 * `yes`: Strapi sends a count. `no`: Strapi sends the document or null.
 * `unknown`: either may happen, so a check must not require the count.
 */
export type RelationCount = "yes" | "no" | "unknown";

export function relationCount(
  storage: RelationStorage | undefined,
  owner: string,
  key: string,
  attribute: Attribute | undefined,
): RelationCount {
  if (!storage || attribute?.type !== "relation") return "unknown";
  if (
    attribute.relation === "morphToOne" ||
    attribute.relation === "morphToMany"
  )
    return "unknown";
  const stored = storage(owner, key);
  return stored === "join-table"
    ? "yes"
    : stored === "join-column"
      ? "no"
      : "unknown";
}
