import { resolve } from "node:path";
import { consoleLogger } from "../logger.ts";
import type { Logger } from "../logger.ts";
import type { GenerationResult, PluginSpec } from "../plugins/types.ts";
import { generatePlugin } from "./generate-plugin.ts";

interface GenerateAllOptions {
  readonly specs: readonly PluginSpec[];
  readonly outDir: string;
  readonly logger?: Logger;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Generate each plugin's JSON concurrently
 *
 * Logs each outcome, and returns the results.
 */
export async function generateAll({
  specs,
  outDir,
  logger = consoleLogger,
}: GenerateAllOptions): Promise<readonly GenerationResult[]> {
  const resolvedOutDir = resolve(outDir);
  const results = await Promise.all(specs.map((spec) => generatePlugin(spec, resolvedOutDir)));

  for (const result of results) {
    if (result.status === "generated") {
      logger.info(`generated ${result.plugin}: ${result.ruleCount} rules`);
    } else if (result.status === "skipped") {
      logger.warn(`skipped ${result.plugin}: ${result.reason}`);
    } else {
      logger.error(`failed ${result.plugin}: ${formatError(result.error)}`, result.error);
    }
  }

  const generatedCount = results.filter((result) => result.status === "generated").length;
  const skippedCount = results.filter((result) => result.status === "skipped").length;
  const failedCount = results.filter((result) => result.status === "failed").length;

  logger.info(
    `complete: ${generatedCount} generated, ${skippedCount} skipped, ${failedCount} failed`,
  );

  return results;
}

export type { GenerateAllOptions };
