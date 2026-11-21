import type { RouteEntry } from "../catalog";
import type { OpenAPIDocument } from "./assemble";
import type { JSONSchema } from "./schemas";

import { resolveLocalPointer } from "./pointer";
import { isOperationMethod, visitDocumentSchemas } from "./schemas";

/**
 * Checks that generated operations match the route catalog and have unique operation IDs.
 * Schema references must resolve locally. This check does not validate the full OpenAPI specification.
 *
 * @throws If an operation or reference check fails, or if `oneOf` branches lack a common required property with distinct literal values.
 */
export function selfCheck(document: OpenAPIDocument, routes: RouteEntry[]) {
  const ids = new Set<string>();
  let count = 0;
  for (const operations of Object.values(document.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!isOperationMethod(method)) continue;
      if (ids.has(operation.operationId))
        throw new Error(`Duplicate operationId ${operation.operationId}`);
      ids.add(operation.operationId);
      count++;
    }
  }
  if (
    count !== routes.length ||
    routes.some(
      (route) =>
        !document.paths[route.openapiPath]?.[route.method.toLowerCase()],
    )
  ) {
    throw new Error("OpenAPI operations do not match the route catalog");
  }
  visitDocumentSchemas(document, (node) => {
    if (!Object.hasOwn(node, "$ref")) return;
    const ref = node.$ref;
    if (
      typeof ref !== "string" ||
      resolveLocalPointer(document, ref) === undefined
    ) {
      throw new Error(`Unresolved OpenAPI reference: ${ref}`);
    }
  });
  visitDocumentSchemas(document, (node) => {
    if (Array.isArray(node.oneOf)) checkOneOf(document, node.oneOf);
  });
}

function isSchemaObject(value: unknown): value is JSONSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolve(
  document: OpenAPIDocument,
  schema: unknown,
): JSONSchema | undefined {
  const seen = new Set<string>();
  let current = schema;
  while (isSchemaObject(current) && typeof current.$ref === "string") {
    const ref = current.$ref;
    if (seen.has(ref)) return undefined;
    seen.add(ref);
    current = resolveLocalPointer(document, ref);
  }
  return isSchemaObject(current) ? current : undefined;
}

function tags(branch: JSONSchema): Map<string, unknown> {
  const found = new Map<string, unknown>();
  const parts = [branch, ...(Array.isArray(branch.allOf) ? branch.allOf : [])];
  for (const part of parts) {
    if (!isSchemaObject(part) || !isSchemaObject(part.properties)) continue;
    const properties = part.properties;
    const required = new Set(Array.isArray(part.required) ? part.required : []);
    for (const [name, property] of Object.entries(properties)) {
      if (!required.has(name) || !isSchemaObject(property)) continue;
      if (Object.hasOwn(property, "const")) found.set(name, property.const);
      else if (Array.isArray(property.enum) && property.enum.length === 1)
        found.set(name, property.enum[0]);
    }
  }
  return found;
}

function checkOneOf(document: OpenAPIDocument, branches: unknown[]) {
  const resolved = branches.map((branch) => resolve(document, branch));
  const branchTags = resolved.map((branch) =>
    branch ? tags(branch) : new Map<string, unknown>(),
  );
  const shared = [...(branchTags[0]?.keys() ?? [])].filter((name) =>
    branchTags.every((map) => map.has(name)),
  );
  const disjoint = shared.some(
    (name) =>
      new Set(branchTags.map((map) => JSON.stringify(map.get(name)))).size ===
      branches.length,
  );
  if (!disjoint) {
    throw new Error(
      `oneOf branches are not discriminated by a required literal property: ${JSON.stringify(branches).slice(0, 200)}`,
    );
  }
}
