import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { OpenAPIDocument } from "../spec/assemble";

// oxlint-disable-next-line unicorn/prefer-module -- Strapi loads this package as CommonJS.
const templates = join(__dirname, "templates");

/** Hand-written client files, copied as they are. */
const TEMPLATES = [
  "client.ts",
  "index.ts",
  "query-string.ts",
  "unchecked.ts",
  "validate.ts",
];

/** `api::article.article.findOne` to `apiArticleArticleFindOne`. */
function operationName(operationId: string): string {
  return operationId
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((word, index) =>
      index === 0 ? word : `${word[0]?.toUpperCase()}${word.slice(1)}`,
    )
    .join("");
}

/**
 * Prepare a contract schema for zod's `fromJSONSchema`: point `$ref`s at
 * `$defs`, and drop `if`/`then`/`else`, which zod cannot express. Only
 * the conditional rules (such as a field required for one `kind`) go
 * unchecked; the rest of the schema is still validated.
 */
function toZodJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toZodJsonSchema);
  if (node === null || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "if" || key === "then" || key === "else") continue;
    out[key] =
      key === "$ref" && typeof value === "string"
        ? value.replace("#/components/schemas/", "#/$defs/")
        : toZodJsonSchema(value);
  }
  return out;
}

/**
 * Keep only the `$defs` that `roots` reach, following `$ref`s. Most of a
 * Strapi contract (filters, populate, inputs) describes requests, which
 * response validation never needs.
 */
function reachableDefs(
  defs: Record<string, unknown>,
  roots: unknown[],
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  const visit = (node: unknown): void => {
    for (const [, name] of JSON.stringify(node).matchAll(
      /"#\/\$defs\/([^"]+)"/gu,
    )) {
      if (name === undefined || name in kept) continue;
      kept[name] = defs[name];
      visit(defs[name]);
    }
  };
  for (const root of roots) visit(root);
  return kept;
}

/**
 * Write `generated/schemas.ts` (the contract's component schemas) and
 * `generated/checked.ts` (every operation, with its 2xx JSON schemas
 * attached). A schema that zod cannot convert is left out, with a warning,
 * so that operation is returned unchecked rather than failing at runtime.
 */
async function writeValidation(
  document: OpenAPIDocument,
  generated: string,
): Promise<string[]> {
  const { fromJSONSchema } = await import("zod");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const $defs = toZodJsonSchema(document.components.schemas) as Record<
    string,
    unknown
  >;
  const roots: unknown[] = [];
  const warnings: string[] = [];
  const lines = [
    "// Operations that check 2xx bodies against the contract's schemas.",
    'import { withSchemas } from "../validate.js";',
    'import * as raw from "./cms.js";',
    "",
    'export * from "./cms.js";',
    "",
  ];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      const schemas: Record<string, unknown> = {};
      for (const [status, response] of Object.entries(operation.responses)) {
        const schema = response.content?.["application/json"]?.schema;
        if (!/^2\d\d$/u.test(status) || schema === undefined) continue;
        const json = toZodJsonSchema(schema);
        try {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          fromJSONSchema({ ...(json as object), $defs } as never);
          schemas[status] = json;
          roots.push(json);
        } catch (error) {
          warnings.push(
            `Not validating ${method.toUpperCase()} ${path} ${status}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (Object.keys(schemas).length === 0) continue;
      const name = operationName(operation.operationId);
      lines.push(
        `export const ${name} = /*#__PURE__*/ withSchemas(raw.${name}, ${JSON.stringify(schemas)});`,
      );
    }
  }
  await writeFile(join(generated, "checked.ts"), `${lines.join("\n")}\n`);
  await writeFile(
    join(generated, "schemas.ts"),
    `// The component schemas that 2xx bodies use, for zod's fromJSONSchema.\nexport const $defs: Record<string, Record<string, unknown>> = ${JSON.stringify(reachableDefs($defs, roots))};\n`,
  );
  return warnings;
}

/**
 * Generate a typed fetch client for the contract into `output`.
 *
 * @returns Warnings about responses the client cannot validate.
 */
export async function generateClient(
  document: OpenAPIDocument,
  output: string,
): Promise<string[]> {
  const { generate } = await import("orval");
  const generated = join(output, "generated");
  await mkdir(generated, { recursive: true });
  await Promise.all(
    TEMPLATES.map((file) =>
      copyFile(join(templates, `${file}.template`), join(output, file)),
    ),
  );
  await generate({
    input: { target: document },
    output: {
      target: join(generated, "cms.ts"),
      client: "fetch",
      mode: "single",
      tsconfig: { compilerOptions: { module: "NodeNext" } },
      override: {
        header: false,
        // Name operations here, so checked.ts can refer to them.
        operationName: (operation) =>
          operationName(String(operation.operationId)),
        fetch: { runtimeImplementationStyle: "shared" },
        paramsSerializer: {
          path: join(output, "query-string.ts"),
          name: "serializeStrapiQuery",
        },
      },
    },
  });
  return writeValidation(document, generated);
}
