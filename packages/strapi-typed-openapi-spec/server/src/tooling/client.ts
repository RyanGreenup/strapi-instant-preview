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

const COMPONENT_REF = "#/components/schemas/";

/**
 * The component names a schema refers to, or `undefined` if it has a
 * `$ref` that is not a component.
 */
function componentRefs(node: unknown, found = new Set<string>()) {
  if (node === null || typeof node !== "object") return found;
  for (const [key, value] of Object.entries(node)) {
    if (key !== "$ref") componentRefs(value, found);
    else if (typeof value === "string" && value.startsWith(COMPONENT_REF)) {
      found.add(value.slice(COMPONENT_REF.length));
    } else throw new Error(`Unsupported $ref ${String(value)}`);
  }
  return found;
}

/**
 * Keep only the components that `roots` reach. Most of a Strapi contract
 * (filters, populate, inputs) describes requests, which response
 * validation never needs. Throws if a reference does not resolve.
 */
function reachableComponents(
  components: Record<string, unknown>,
  roots: unknown[],
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  const pending = roots.flatMap((root) => [...componentRefs(root)]);
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (name in kept) continue;
    if (!Object.hasOwn(components, name)) {
      throw new Error(`Unresolved $ref ${COMPONENT_REF}${name}`);
    }
    kept[name] = components[name];
    pending.push(...componentRefs(components[name]));
  }
  return kept;
}

/**
 * TypeBox resolves a `$ref` by name against its context, so
 * `#/components/schemas/Article` becomes `Article`.
 */
function toContextRefs<T>(schema: T): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(
    JSON.stringify(schema).replaceAll(`"${COMPONENT_REF}`, '"'),
  ) as T;
}

/**
 * Write `generated/schemas.ts` (the component schemas that 2xx bodies use)
 * and `generated/checked.ts` (every operation, with its 2xx JSON schemas
 * attached). A schema with a reference that does not resolve is left out,
 * with a warning, so that operation is returned unchecked rather than
 * failing at runtime.
 */
async function writeValidation(
  document: OpenAPIDocument,
  generated: string,
): Promise<string[]> {
  const components = document.components.schemas;
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
        try {
          reachableComponents(components, [schema]);
          schemas[status] = toContextRefs(schema);
          roots.push(schema);
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
    `// The component schemas that 2xx bodies use, keyed by name for TypeBox.\nexport const $defs: Record<string, object> = ${JSON.stringify(toContextRefs(reachableComponents(components, roots)))};\n`,
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
