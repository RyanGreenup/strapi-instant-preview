import { expect, test } from "vitest";

import checks from "../../dist/server/src/spec/self-check.js";

const { selfCheck } = checks;
const document = (schemas) => ({ paths: {}, components: { schemas } });
const ref = ($ref) => ({ $ref });
const tagged = (name) => ({
  properties: { kind: { const: name } },
  required: ["kind"],
});

test("references in annotation data are not schema references", () => {
  const data = { $ref: "#/missing", oneOf: [true, false] };
  const doc = document({
    Example: { default: data, examples: [data], const: data, enum: [data] },
  });
  doc.info = { "x-example": data };
  expect(() => selfCheck(doc, [])).not.toThrow();
});

test("a dangling reference nested in a subschema is reported", () => {
  const doc = document({
    Example: { items: { anyOf: [true, ref("#/missing")] } },
  });
  expect(() => selfCheck(doc, [])).toThrow(
    "Unresolved OpenAPI reference: #/missing",
  );
});

test("path-item parameter schemas are checked without counting parameters as operations", () => {
  const doc = document({ Never: false });
  const parameter = {
    name: "q",
    in: "query",
    schema: ref("#/components/schemas/Never"),
  };
  doc.paths["/example"] = {
    parameters: [parameter],
    get: { operationId: "example", responses: {} },
  };
  const routes = [{ openapiPath: "/example", method: "GET" }];
  expect(() => selfCheck(doc, routes)).not.toThrow();
  parameter.schema = ref("#/missing");
  expect(() => selfCheck(doc, routes)).toThrow(
    "Unresolved OpenAPI reference: #/missing",
  );
});

test("oneOf follows aliases to nested schema locations and ignores Boolean properties when finding tags", () => {
  const a = tagged("a");
  a.properties.extra = true;
  a.required.push("extra");
  const doc = document({
    "Models/A": { $defs: { nested: a } },
    Alias: ref("#/components/schemas/Models%2FA/$defs/nested"),
    Union: { oneOf: [ref("#/components/schemas/Alias"), tagged("b")] },
  });
  expect(() => selfCheck(doc, [])).not.toThrow();
});

test.each([
  true,
  false,
  ref("#/components/schemas/Never"),
  ref("#/components/schemas/Loop"),
])("a Boolean or cyclic branch has no discriminator: %j", (branch) => {
  const doc = document({
    Never: false,
    Loop: ref("#/components/schemas/Loop"),
    Union: { oneOf: [branch, tagged("a")] },
  });
  expect(() => selfCheck(doc, [])).toThrow(
    /oneOf branches are not discriminated/,
  );
});
