import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generatePlugin } from "../../scripts/generate/generate/generate-plugin.ts";
import { isRecord, parseJson } from "../../scripts/generate/guards.ts";
import { pluginSpecs } from "../../scripts/generate/plugins/specs.ts";
import type { PluginSpec } from "../../scripts/generate/plugins/types.ts";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "oxlint-rulegen-specs-"));
  temporaryDirectories.push(directory);
  return directory;
}

function specFor(name: string): PluginSpec {
  const spec = pluginSpecs.find((candidate) => candidate.name === name);
  if (!spec) {
    throw new Error(`no plugin spec named ${name}`);
  }
  return spec;
}

async function readGeneratedRules(path: string): Promise<Record<string, unknown>> {
  const output = parseJson(await readFile(path, "utf8"));
  if (!isRecord(output) || !isRecord(output["rules"])) {
    throw new Error(`${path} has no rules map`);
  }

  return output["rules"];
}

describe("declared plugin specs", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("generates non-empty typescript recommended rules from the installed plugin", async () => {
    const directory = await temporaryDirectory();
    const result = await generatePlugin(specFor("typescript"), directory);

    expect(result).toMatchObject({ status: "generated", plugin: "typescript" });

    const rules = await readGeneratedRules(join(directory, "typescript-recommended.json"));

    expect(Object.keys(rules).length).toBeGreaterThan(0);
    expect(rules).toHaveProperty("typescript/no-explicit-any", "error");
  }, 30_000);
});
