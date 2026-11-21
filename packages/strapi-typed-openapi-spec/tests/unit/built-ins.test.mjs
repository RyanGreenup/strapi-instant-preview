import { test, expect } from "vitest";
import * as z from "zod/v4";

import builtIns from "../../dist/server/src/contract/built-ins.js";
import builders from "../../dist/server/src/schemas/index.js";

const { createSchemas } = builders;
const { builtIns: createBuiltIns, modelResponse } = builtIns;

const roleUid = "plugin::users-permissions.role";
const roleModel = {
  info: { singularName: "role" },
  attributes: {
    name: { type: "string", required: true },
    description: { type: "string" },
    type: { type: "string" },
    createdAt: { type: "datetime" },
    updatedAt: { type: "datetime" },
    publishedAt: { type: "datetime" },
  },
};
const schemasFor = (contentTypes) =>
  createSchemas(
    z,
    { contentTypes, components: {} },
    { documentIdPattern: "loose", strictResponseObjects: true },
  );
const role = {
  id: 1,
  documentId: "abc",
  name: "Authenticated",
  description: null,
  type: "authenticated",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z",
};
const fields = [
  "id",
  "documentId",
  "name",
  "description",
  "type",
  "createdAt",
  "updatedAt",
  "publishedAt",
];

test("a model response takes its field types from the model and requires every selected field", () => {
  const schema = modelResponse(
    schemasFor({ [roleUid]: roleModel }),
    roleUid,
    fields,
    "roles",
  );
  expect(schema.safeParse(role).success).toBe(true);
  expect(schema.safeParse({ ...role, name: 42 }).success).toBe(false);
  const { type: _type, ...withoutType } = role;
  expect(schema.safeParse(withoutType).success).toBe(false);
  // Strict like the document it narrows: a field the controller does not return is rejected.
  expect(schema.safeParse({ ...role, users: [] }).success).toBe(false);
});

test("a missing model or field fails generation loudly instead of using a stale shape", () => {
  expect(() => modelResponse(schemasFor({}), roleUid, fields, "roles")).toThrow(
    `roles is derived from the Strapi model ${roleUid}, which is not loaded`,
  );
  const { type: _type, ...attributes } = roleModel.attributes;
  expect(() =>
    modelResponse(
      schemasFor({ [roleUid]: { ...roleModel, attributes } }),
      roleUid,
      fields,
      "roles",
    ),
  ).toThrow(
    `roles is derived from the Strapi model ${roleUid}, which no longer has type`,
  );
});

test("role contracts derive lazily, so a plugin whose routes never appear never reads its models", () => {
  const contracts = createBuiltIns(z, schemasFor({}));
  // An unrelated users-permissions route builds the table without touching the missing role model.
  expect(
    contracts({
      source: { name: "users-permissions" },
      handler: "plugin::users-permissions.auth.logout",
      method: "POST",
      upstream: {},
    }),
  ).toBeDefined();
  expect(() =>
    contracts({
      source: { name: "users-permissions" },
      handler: "plugin::users-permissions.role.find",
      method: "GET",
      upstream: {},
    }),
  ).toThrow(/which is not loaded/);
});
