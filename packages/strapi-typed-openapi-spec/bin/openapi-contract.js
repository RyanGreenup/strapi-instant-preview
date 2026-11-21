#!/usr/bin/env node
"use strict";

const { readFile, writeFile } = require("node:fs/promises");
const { extname, resolve } = require("node:path");
const { parseArgs, isDeepStrictEqual, inspect } = require("node:util");
const { parse, stringify } = require("yaml");

const stringOption = (metavar) => ({ type: "string", metavar });
const app = stringOption("<directory>");
const help = { type: "boolean", short: "h" };
const config = stringOption("config.json");
const commands = {
  generate: {
    out: stringOption("specification.json"),
    format: stringOption("json|yaml"),
    coverage: stringOption("coverage.json"),
    config,
  },
  check: { against: stringOption("specification.json"), config },
  probe: {},
  audit: { baseline: stringOption("audit.json") },
};
const optionUsage = (name, option) => `[--${name} ${option.metavar}]`;
const width = Math.max(...Object.keys(commands).map((name) => name.length));
const rows = Object.entries(commands).map(([name, options]) => {
  const flags = Object.entries(options).map(([key, option]) =>
    optionUsage(key, option),
  );
  return `  ${flags.length ? [name.padEnd(width), ...flags].join(" ") : name}`;
});
const usage = `Usage: openapi-contract <command> ${optionUsage("app", app)}\n\n${rows.join("\n")}\n`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(usage);
    return;
  }
  if (!Object.hasOwn(commands, command))
    throw new Error(`Unknown command ${command}\n${usage}`);
  const { values } = parseArgs({
    args,
    options: { app, help, ...commands[command] },
  });
  if (values.help) {
    process.stdout.write(usage);
    return;
  }
  const appDir = resolve(values.app ?? ".");
  if (command === "audit") {
    const {
      auditControllers,
    } = require("../dist/server/src/contract/audit.js");
    const baseline =
      values.baseline === undefined
        ? undefined
        : JSON.parse(await readFile(values.baseline, "utf8"));
    if (
      values.baseline !== undefined &&
      (!Array.isArray(baseline) ||
        baseline.some((hit) => typeof hit !== "string"))
    ) {
      throw new Error("Audit baseline must be a JSON array of strings");
    }
    const result = auditControllers(appDir, baseline);
    console.log(JSON.stringify(result, null, 2));
    if (result.added.length) process.exitCode = 1;
    return;
  }

  if (values.format !== undefined && !["json", "yaml"].includes(values.format))
    throw new Error("Format must be json or yaml");
  const overrides =
    values.config === undefined
      ? undefined
      : JSON.parse(await readFile(values.config, "utf8"));
  if (
    values.config !== undefined &&
    (overrides === null ||
      typeof overrides !== "object" ||
      Array.isArray(overrides))
  ) {
    throw new Error("Contract configuration must be a JSON object");
  }
  const { withStrapi } = require("../dist/server/src/boot/with-strapi.js");
  await withStrapi(
    async (app) => {
      if (command === "probe") {
        const {
          inspectCatalog,
        } = require("../dist/server/src/catalog/index.js");
        const result = inspectCatalog(app);
        console.table(result.checks, ["name", "status", "detail"]);
        console.table(
          result.routes.map((r) => ({
            method: r.method,
            path: r.openapiPath,
            handler: r.handler,
          })),
        );
        if (!result.ok) process.exitCode = 1;
        return;
      }
      const { assemble } = require("../dist/server/src/spec/assemble.js");
      const { document, coverage } = assemble(app, overrides);
      const json = JSON.stringify(document, null, 2);
      if (command === "check") {
        const against = values.against ?? "specification.json";
        const source = await readFile(against, "utf8");
        const expected = /\.ya?ml$/i.test(against)
          ? parse(source)
          : JSON.parse(source);
        const actual = JSON.parse(json);
        if (!isDeepStrictEqual(expected, actual)) {
          const sections = [
            ...new Set([
              ...Object.keys(expected ?? {}),
              ...Object.keys(actual),
            ]),
          ].filter((key) => !isDeepStrictEqual(expected?.[key], actual[key]));
          throw new Error(
            `Generated contract differs from ${against} in: ${sections.join(", ") || "document root"}`,
          );
        }
        console.log(`Contract matches ${against}`);
        return;
      }
      const format =
        values.format ??
        (/^\.ya?ml$/i.test(extname(values.out ?? "")) ? "yaml" : "json");
      const output = values.out ?? `specification.${format}`;
      await writeFile(
        output,
        format === "json" ? `${json}\n` : stringify(JSON.parse(json)),
      );
      if (values.coverage)
        await writeFile(
          values.coverage,
          `${JSON.stringify(coverage, null, 2)}\n`,
        );
      console.table(coverage.routes);
      for (const warning of coverage.warnings) console.warn(warning);
      for (const notice of coverage.notices) console.warn(`Notice: ${notice}`);
      console.log(`Wrote ${output}`);
    },
    { appDir },
  );
}

main().catch((error) => {
  console.error(inspect(error, { depth: 5, colors: process.stderr.isTTY }));
  process.exitCode = 1;
});
