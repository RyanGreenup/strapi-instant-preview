import { defineCommand } from "citty";

import type { GenerationResult } from "./plugins/types.ts";

import { generateAll } from "./generate/generate-all.ts";
import { consoleLogger } from "./logger.ts";
import { pluginSpecs } from "./plugins/specs.ts";

/** Return exit code 1 when any result failed, otherwise `undefined`. */
export function exitCodeFor(
  results: readonly GenerationResult[],
): 1 | undefined {
  return results.some((result) => result.status === "failed") ? 1 : undefined;
}

export const generateCommand = defineCommand({
  meta: {
    name: "generate",
    description: "Generate Oxlint recommended-rule JSON from ESLint plugins.",
  },
  args: {
    "out-dir": {
      type: "string",
      alias: "o",
      description: "Directory in which to write generated JSON files.",
      valueHint: "path",
      required: true,
    },
  },
  async run({ args }) {
    const results = await generateAll({
      specs: pluginSpecs,
      outDir: args["out-dir"],
      logger: consoleLogger,
    });

    process.exitCode = exitCodeFor(results);
  },
});

export const mainCommand = defineCommand({
  meta: {
    name: "oxlint-rulegen",
    description: "Build-time utilities for @ryangreenup/oxlint-config.",
  },
  subCommands: {
    generate: generateCommand,
  },
});
