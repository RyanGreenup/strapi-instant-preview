import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { exitCodeFor } from "../../scripts/generate/cli.ts";
import { generateAll } from "../../scripts/generate/generate/generate-all.ts";
import { generatePlugin } from "../../scripts/generate/generate/generate-plugin.ts";
import { parseJson } from "../../scripts/generate/guards.ts";
import { writeJson } from "../../scripts/generate/io/write-json.ts";
import type { Logger } from "../../scripts/generate/logger.ts";
import type { PluginSpec } from "../../scripts/generate/plugins/types.ts";

const temporaryDirectories: string[] = [];
const fixtureSpecifier = pathToFileURL(
  join(import.meta.dirname, "..", "fixtures", "recommended-plugin.mjs"),
).href;

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "oxlint-rulegen-"));
  temporaryDirectories.push(directory);
  return directory;
}

function fixtureSpec(overrides: Partial<PluginSpec> = {}): PluginSpec {
  return {
    name: "fixture",
    specifier: fixtureSpecifier,
    mode: "jsPlugin",
    jsPluginName: "fixture",
    jsPluginSpecifier: "eslint-plugin-fixture",
    pick: (module) => module.default,
    ...overrides,
  };
}

async function readJsonFile(path: string): Promise<unknown> {
  return parseJson(await readFile(path, "utf8"));
}

/** Records what the generator reported, so the summary lines can be asserted on. */
function recordingLogger(): { messages: Record<string, string[]>; logger: Logger } {
  const messages: Record<string, string[]> = { info: [], warn: [], error: [] };
  const record = (channel: string, message: string): void => {
    messages[channel]?.push(message);
  };

  return {
    messages,
    logger: {
      info: (message) => {
        record("info", message);
      },
      warn: (message) => {
        record("warn", message);
      },
      error: (message) => {
        record("error", message);
      },
    },
  };
}

function summarySpecs(): readonly PluginSpec[] {
  return [
    fixtureSpec({ name: "generated" }),
    fixtureSpec({ name: "skipped", specifier: "missing-plugin-for-summary" }),
    fixtureSpec({
      name: "failed",
      pick: () => {
        throw new Error("selection failed");
      },
    }),
  ];
}

async function cleanupTemporaryDirectories(): Promise<void> {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
}

describe("writeJson", () => {
  afterEach(cleanupTemporaryDirectories);

  it("creates directories and atomically replaces newline-terminated JSON", async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, "nested", "output.json");

    await writeJson(outputPath, { stale: true });
    await writeJson(outputPath, { current: true });

    await expect(readFile(outputPath, "utf8")).resolves.toBe('{\n  "current": true\n}\n');
  }, 10_000);
});

describe("generatePlugin", () => {
  afterEach(cleanupTemporaryDirectories);

  it("generates a JS-plugin config and reports its rule count", async () => {
    const directory = await temporaryDirectory();
    const result = await generatePlugin(fixtureSpec(), directory);

    expect(result).toMatchObject({
      status: "generated",
      plugin: "fixture",
      ruleCount: 2,
    });
    await expect(readJsonFile(join(directory, "fixture-recommended.json"))).resolves.toStrictEqual({
      jsPlugins: [{ name: "fixture", specifier: "eslint-plugin-fixture" }],
      rules: {
        "fixture/error": "error",
        "fixture/warn": ["warn", { option: true }],
      },
    });
  }, 10_000);

  it("writes an empty stub when a plugin cannot be imported", async () => {
    const directory = await temporaryDirectory();
    const result = await generatePlugin(
      fixtureSpec({ name: "missing", specifier: "definitely-not-installed-plugin" }),
      directory,
    );

    expect(result).toMatchObject({ status: "skipped", plugin: "missing" });
    await expect(readJsonFile(join(directory, "missing-recommended.json"))).resolves.toStrictEqual({
      rules: {},
    });
  }, 10_000);

  it("reports selector and filesystem errors as failures", async () => {
    const directory = await temporaryDirectory();
    const selectorFailure = await generatePlugin(
      fixtureSpec({
        pick: () => {
          throw new Error("bad selector");
        },
      }),
      directory,
    );

    const blockedOutputDirectory = join(directory, "not-a-directory");
    await writeFile(blockedOutputDirectory, "blocked", "utf8");
    const writeFailure = await generatePlugin(fixtureSpec(), blockedOutputDirectory);

    expect(selectorFailure).toMatchObject({ status: "failed", plugin: "fixture" });
    expect(writeFailure).toMatchObject({ status: "failed", plugin: "fixture" });
  }, 10_000);
});

describe("generateAll", () => {
  afterEach(cleanupTemporaryDirectories);

  it("preserves result order and summarizes every outcome", async () => {
    const directory = await temporaryDirectory();
    const { messages, logger } = recordingLogger();

    const results = await generateAll({ specs: summarySpecs(), outDir: directory, logger });

    expect(results.map((result) => result.plugin)).toStrictEqual([
      "generated",
      "skipped",
      "failed",
    ]);
    expect(messages["info"]?.at(-1)).toBe("complete: 1 generated, 1 skipped, 1 failed");
    expect(messages["warn"]).toHaveLength(1);
    expect(messages["error"]).toHaveLength(1);
  }, 10_000);

  it("drives the exit status from the failures it reported", async () => {
    const directory = await temporaryDirectory();
    const { logger } = recordingLogger();

    const results = await generateAll({ specs: summarySpecs(), outDir: directory, logger });

    expect(exitCodeFor(results)).toBe(1);
    expect(exitCodeFor(results.slice(0, 2))).toBeUndefined();
  }, 10_000);
});
