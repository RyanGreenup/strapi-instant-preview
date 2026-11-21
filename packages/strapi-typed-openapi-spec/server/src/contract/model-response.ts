import type { SchemaObject, Schemas } from "../schemas";

/**
 * The response document of a plugin model, narrowed to the fields its
 * controller returns. The shape comes from the booted Strapi model, not a copy
 * of it. A missing model or field throws, so a Strapi upgrade that changes the
 * model fails generation instead of publishing a stale shape. Call it lazily,
 * from a route's contract: a disabled plugin has neither routes nor models.
 */
export function modelResponse(
  schemas: Schemas,
  uid: string,
  fields: readonly string[],
  label: string,
): SchemaObject {
  let document: SchemaObject;
  try {
    document = schemas.document(uid);
  } catch (cause) {
    throw new Error(
      `${label} is derived from the Strapi model ${uid}, which is not loaded`,
      { cause },
    );
  }
  const missing = fields.filter(
    (field) => !Object.hasOwn(document.shape, field),
  );
  if (missing.length) {
    throw new Error(
      `${label} is derived from the Strapi model ${uid}, which no longer has ${missing.join(", ")}`,
    );
  }
  // The controller always selects these fields, so each key is present (a value may still be null).
  // pick keeps the document's strict or loose object mode (strictResponseObjects).
  const mask = Object.fromEntries(
    fields.map((field) => [field, true]),
  ) as Parameters<SchemaObject["pick"]>[0];
  return document.pick(mask).required();
}
