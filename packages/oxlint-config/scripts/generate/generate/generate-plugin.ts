import { resolve } from "node:path";
import { importPlugin } from "../io/import-plugin.ts";
import { writeJson } from "../io/write-json.ts";
import { modeHandlers } from "../modes/index.ts";
import type {
  GenerationResult,
  PluginModule,
  PluginSpec,
} from "../plugins/types.ts";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? (error.message.split("\n")[0] ?? error.message)
    : String(error);
}

function countRules(output: unknown): number {
  if (
    typeof output !== "object" ||
    output === null ||
    !("rules" in output) ||
    typeof output.rules !== "object" ||
    output.rules === null
  ) {
    return 0;
  }

  return Object.keys(output.rules).length;
}

type ImportOutcome =
  { readonly module: PluginModule } | { readonly error: unknown };

async function tryImportPlugin(specifier: string): Promise<ImportOutcome> {
  try {
    return { module: await importPlugin(specifier) };
  } catch (error) {
    return { error };
  }
}

/**
 * Generate the recommended-rule JSON at `outDir`.
 *
 * When the plugin fails to import this will write an empty rules file and report the plugin as skipped.
 */
export async function generatePlugin(
  spec: PluginSpec,
  outDir: string,
): Promise<GenerationResult> {
  const outputPath = resolve(outDir, `${spec.name}-recommended.json`);

  const imported = await tryImportPlugin(spec.specifier);
  if ("error" in imported) {
    try {
      await writeJson(outputPath, { rules: {} });
    } catch (writeError) {
      return { status: "failed", plugin: spec.name, error: writeError };
    }

    return {
      status: "skipped",
      plugin: spec.name,
      reason: errorMessage(imported.error),
      outputPath,
    };
  }

  try {
    const selectedConfig = spec.pick(imported.module);
    const output = await modeHandlers[spec.mode](spec, selectedConfig);
    await writeJson(outputPath, output);

    return {
      status: "generated",
      plugin: spec.name,
      ruleCount: countRules(output),
      outputPath,
    };
  } catch (error) {
    return { status: "failed", plugin: spec.name, error };
  }
}
