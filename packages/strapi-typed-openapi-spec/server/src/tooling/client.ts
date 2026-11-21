import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

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

/** One operation in the contract, as the generated files name it. */
interface Operation {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  /** The position of the trailing `CallOptions` parameter. */
  readonly optionsIndex: number;
  readonly responses: OpenAPIDocument["paths"][string][string]["responses"];
}

type OperationObject = OpenAPIDocument["paths"][string][string];

/**
 * Where orval puts an operation's `CallOptions` parameter. Its fetch
 * signatures take each path parameter in path order, then the request body,
 * then one object of query parameters, then the options. The client test
 * checks this against the generated functions.
 */
function optionsIndex(operation: OperationObject, label: string): number {
  const parameters = operation.parameters ?? [];
  const other = parameters.find((p) => p.in !== "path" && p.in !== "query");
  if (other !== undefined) {
    throw new Error(`${label}: ${other.in} parameters are not supported`);
  }
  return (
    parameters.filter((p) => p.in === "path").length +
    (operation.requestBody === undefined ? 0 : 1) +
    (parameters.some((p) => p.in === "query") ? 1 : 0)
  );
}

function operationsOf(document: OpenAPIDocument): Operation[] {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, operation]) => ({
      name: operationName(operation.operationId),
      method: method.toUpperCase(),
      path,
      optionsIndex: optionsIndex(operation, `${method.toUpperCase()} ${path}`),
      responses: operation.responses,
    })),
  );
}

/**
 * Write `generated/operations.ts`: every operation, with the method, path
 * template and options position that `bindClient` reads. The position comes
 * from the contract, not from `Function.length`, which stops counting at a
 * parameter with a default.
 */
async function writeOperations(
  operations: readonly Operation[],
  generated: string,
): Promise<void> {
  const lines = [
    "// Operations with what `bindClient` needs to know about each one.",
    'import { describeOperation } from "../client.js";',
    'import * as raw from "./cms.js";',
    "",
    'export * from "./cms.js";',
    "",
  ];
  for (const { name, method, path, optionsIndex: index } of operations) {
    const info = { method, path, optionsIndex: index };
    lines.push(
      `export const ${name} = /*#__PURE__*/ describeOperation(raw.${name}, ${JSON.stringify(info)});`,
    );
  }
  await writeFile(join(generated, "operations.ts"), `${lines.join("\n")}\n`);
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
  operations: readonly Operation[],
  generated: string,
): Promise<string[]> {
  const components = document.components.schemas;
  const roots: unknown[] = [];
  const warnings: string[] = [];
  const lines = [
    "// Operations that check 2xx bodies against the contract's schemas.",
    'import { withSchemas } from "../validate.js";',
    'import * as described from "./operations.js";',
    "",
    'export * from "./operations.js";',
    "",
  ];
  for (const { name, method, path, responses } of operations) {
    const schemas: Record<string, unknown> = {};
    for (const [status, response] of Object.entries(responses)) {
      const schema = response.content?.["application/json"]?.schema;
      if (!/^2\d\d$/u.test(status) || schema === undefined) continue;
      try {
        reachableComponents(components, [schema]);
        schemas[status] = toContextRefs(schema);
        roots.push(schema);
      } catch (error) {
        warnings.push(
          `Not validating ${method} ${path} ${status}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (Object.keys(schemas).length === 0) continue;
    lines.push(
      `export const ${name} = /*#__PURE__*/ withSchemas(described.${name}, ${JSON.stringify(schemas)});`,
    );
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
      // Path parameters go through encodeURIComponent, so an ID cannot add
      // path segments or a query string.
      urlEncodeParameters: true,
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
  const operations = operationsOf(document);
  await writeOperations(operations, generated);
  return writeValidation(document, operations, generated);
}

/** Every file under `directory`, as paths relative to it. */
async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)));
}

/**
 * Compare the client in `output` with a fresh generation from the contract,
 * without changing `output`. Use it in CI so a contract change cannot be
 * merged without the client that matches it.
 *
 * @returns The files that differ, are missing, or should not be there, as
 *   paths relative to `output`. Empty when the client is up to date.
 */
export async function checkClient(
  document: OpenAPIDocument,
  output: string,
): Promise<string[]> {
  const fresh = await mkdtemp(join(tmpdir(), "openapi-contract-client-"));
  try {
    await generateClient(document, fresh);
    const names = new Set([
      ...(await filesUnder(fresh)),
      ...(await filesUnder(output)),
    ]);
    /** A file's text, or `undefined` if it is missing. */
    const read = async (path: string): Promise<string | undefined> => {
      try {
        return await readFile(path, "utf8");
      } catch {
        return undefined;
      }
    };
    const differs = await Promise.all(
      [...names].sort().map(async (name) => {
        const [want, have] = await Promise.all([
          read(join(fresh, name)),
          read(join(output, name)),
        ]);
        return want === have ? undefined : name;
      }),
    );
    return differs.filter((name) => name !== undefined);
  } finally {
    await rm(fresh, { recursive: true, force: true });
  }
}
