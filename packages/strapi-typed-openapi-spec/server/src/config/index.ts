import { z } from "zod/v4";

import type { App } from "../adapter";
import type { Result } from "../result";

import { getConfig, pluginName } from "../adapter";
import {
  blockNodeTypes,
  reservedBlockKeys,
  type BlockNodeType,
} from "../schemas/blocks";

const nonBlank = z
  .string()
  .refine((value) => value.trim().length > 0, "must not be blank");

const blockPropertyType = z.union([
  z.enum(["string", "number", "integer", "boolean"]),
  z.strictObject({
    enum: z.array(z.union([z.string(), z.number(), z.boolean()])).min(1),
  }),
]);

// A declaration adds a key; it cannot retype one that Strapi defines.
const blocksProperties = z
  .partialRecord(z.enum(blockNodeTypes), z.record(nonBlank, blockPropertyType))
  .superRefine((value, ctx) => {
    for (const [node, properties] of Object.entries(value)) {
      const reserved: readonly string[] =
        reservedBlockKeys[node as BlockNodeType];
      for (const key of Object.keys(properties ?? {})) {
        if (reserved.includes(key))
          ctx.addIssue({
            code: "custom",
            path: [node, key],
            message: `Strapi already defines ${node}.${key}`,
          });
      }
    }
  });

const configSchema = z.strictObject({
  validateResponses: z.boolean().default(false),
  /**
   * Selects the schema used to check a response, not to validate the request.
   * `zod` uses static Zod contracts. `spec` uses schemas from the emitted OpenAPI document.
   * `query` uses `fields`, `populate`, `status`, and list `pagination` for successful
   * responses from uncustomized actions that use the default core contract, except delete.
   * Other responses and unsupported queries use the static Zod contract.
   */
  validationMode: z.enum(["zod", "spec", "query"]).default("zod"),
  /** Both modes log and record violations. `error` also replaces the response with a 500 `ContractViolation`. */
  failOn: z.enum(["error", "log"]).default("error"),
  /** Fails spec generation on uncovered routes or schema warnings when enabled. */
  strict: z.boolean().default(true),
  /** Replaces the server list. If omitted, generation derives one URL from the app and its REST prefix. */
  servers: z
    .array(
      z.strictObject({ url: nonBlank, description: z.string().optional() }),
    )
    .optional(),
  /** Limits plugin routes in the spec and runtime checks. Omit to include all plugins, or use `[]` for app routes only. */
  includePlugins: z.array(nonBlank).optional(),
  /** Marks authenticated OpenAPI operations as requiring bearer credentials. Does not change Strapi route authentication. */
  requireBearer: z.boolean().default(false),
  /** `loose` accepts any nonempty document ID string. */
  documentIdPattern: z.enum(["cuid2", "loose"]).default("cuid2"),
  /** Rejects undeclared keys in generated model response objects when enabled. */
  strictResponseObjects: z.boolean().default(true),
  // Published documents of api:: types assert required values and published-only bounds.
  // Turn off for data written outside the Document Service or before a rule was tightened.
  publishedResponseRules: z.boolean().default(true),
  /**
   * Types the properties that the app's rich text editor adds to Blocks nodes,
   * keyed by node type, for example `{ paragraph: { fontSize: "number" } }`.
   * Each one is optional. Other unknown keys stay allowed.
   */
  blocksProperties: blocksProperties.optional(),
  /** Registers `GET /openapi-contract/spec.json` under the app's REST prefix. */
  exposeSpec: z.boolean().default(false),
  /** Requires bearer credentials for the exposed spec endpoint when enabled. */
  exposeSpecAuth: z.boolean().default(true),
  info: z
    .strictObject({
      title: nonBlank.optional(),
      version: nonBlank.optional(),
      description: z.string().optional(),
    })
    .optional(),
});

/** Validated plugin settings after the schema fills in defaults. */
export type Config = z.output<typeof configSchema>;
export const defaults: Config = configSchema.parse({});

function validate(config: unknown): Result<Config, Error> {
  const result = configSchema.safeParse(config);
  if (result.success === false) {
    return {
      ok: false,
      error: new Error(
        `Invalid ${pluginName} config:\n${z.prettifyError(result.error)}`,
        { cause: result.error },
      ),
    };
  }
  return { ok: true, value: result.data };
}

/**
 * Reads the plugin config and validates it after a shallow merge with `overrides`.
 *
 * @remarks
 * An override replaces an entire nested value such as `info`. Overrides cannot
 * replace a non-object config. The schema rejects unknown keys.
 *
 * @returns A failed result for config read or validation errors, with the original error as the cause.
 */
export function resolveConfig(
  app: App,
  overrides?: Partial<Config>,
): Result<Config, Error> {
  let configured: unknown;
  try {
    configured = getConfig<unknown>(app, `plugin::${pluginName}`, {});
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      error: new Error(`Cannot read ${pluginName} config: ${detail}`, {
        cause,
      }),
    };
  }
  if (
    overrides === undefined ||
    configured === null ||
    typeof configured !== "object" ||
    Array.isArray(configured)
  ) {
    return validate(configured);
  }
  return validate({ ...configured, ...overrides });
}

function validator(config: unknown): void {
  const result = validate(config);
  if (result.ok === false) throw result.error;
}

export default { default: defaults, validator };
