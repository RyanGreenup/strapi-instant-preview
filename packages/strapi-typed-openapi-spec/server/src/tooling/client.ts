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

const OPENING = { "(": ")", "[": "]", "{": "}", "<": ">" } as const;
const CLOSING = new Set([")", "]", "}", ">"]);

/**
 * The parameter lists of the arrow functions exported by `source`
 *
 * These are keyed by name e.g. `export const name = (a: A, b?: B) =>` gives
 * `["a: A", "b?: B"]`.
 *
 * Only the top level of each list is split, commas inside a parameter's type
 * (generics, object types, string literals) stay in that parameter.
 */
export function exportedParameters(source: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const match of source.matchAll(/^export const (\w+) = \(/gmu)) {
    const [, name] = match;
    if (name === undefined) continue;
    const parameters: string[] = [];
    const closers: string[] = [];
    let current = "";
    let quote: string | undefined;
    for (let index = match.index + match[0].length; index < source.length;) {
      const char = source.charAt(index);
      if (quote !== undefined) {
        current += char;
        if (char === "\\") {
          // Keep the escaped character, whatever it is.
          current += source.charAt(index + 1);
          index += 2;
          continue;
        }
        if (char === quote) quote = undefined;
        index += 1;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "=" && source.charAt(index + 1) === ">") {
        // The arrow of a function type, not a closing `>`.
        current += "=>";
        index += 2;
        continue;
      } else if (char in OPENING) {
        closers.push(OPENING[char as keyof typeof OPENING]);
      } else if (CLOSING.has(char)) {
        if (closers.length === 0) {
          if (char === ")") break;
          throw new Error(`Cannot read the parameters of ${name}`);
        }
        closers.pop();
      } else if (char === "," && closers.length === 0) {
        parameters.push(current.trim());
        current = "";
        index += 1;
        continue;
      }
      current += char;
      index += 1;
    }
    parameters.push(current.trim());
    found.set(
      name,
      parameters.filter((parameter) => parameter !== ""),
    );
  }
  return found;
}

/**
 * The position of each operation's trailing `CallOptions` parameter, read
 * from the generated signatures. Throws if an operation has none, since
 * `bindClient` could then not pass the client's options.
 */
export function optionsIndexes(
  source: string,
  names: readonly string[],
): Map<string, number> {
  const signatures = exportedParameters(source);
  const indexes = new Map<string, number>();
  for (const name of names) {
    const parameters = signatures.get(name);
    const last = parameters?.at(-1);
    if (parameters === undefined || last === undefined) {
      throw new Error(`Generated client has no function ${name}`);
    }
    if (!/^options\??\s*:\s*CallOptions$/u.test(last)) {
      throw new Error(
        `The last parameter of ${name} is \`${last}\`, not \`options?: CallOptions\``,
      );
    }
    indexes.set(name, parameters.length - 1);
  }
  return indexes;
}

/** One operation in the contract, as the generated files name it. */
interface Operation {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly responses: OpenAPIDocument["paths"][string][string]["responses"];
}

function operationsOf(document: OpenAPIDocument): Operation[] {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, operation]) => ({
      name: operationName(operation.operationId),
      method: method.toUpperCase(),
      path,
      responses: operation.responses,
    })),
  );
}

/**
 * Write `generated/operations.ts`: every operation, with the method, path
 * template and options position that `bindClient` reads. Reading the
 * position from the generated code, not from `Function.length`, keeps it
 * right whatever defaults the generator emits.
 */
async function writeOperations(
  operations: readonly Operation[],
  generated: string,
): Promise<void> {
  const source = await readFile(join(generated, "cms.ts"), "utf8");
  const indexes = optionsIndexes(
    source,
    operations.map(({ name }) => name),
  );
  const lines = [
    "// Operations with what `bindClient` needs to know about each one.",
    'import { describeOperation } from "../client.js";',
    'import * as raw from "./cms.js";',
    "",
    'export * from "./cms.js";',
    "",
  ];
  for (const { name, method, path } of operations) {
    const info = { method, path, optionsIndex: indexes.get(name) };
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
