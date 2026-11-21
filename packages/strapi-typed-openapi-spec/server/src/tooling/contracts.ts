import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse, stringify } from "yaml";

import type { Config } from "../config";
import type { Coverage, OpenAPIDocument } from "../spec/assemble";

import { withStrapi } from "../boot/with-strapi";
import { inspectCatalog } from "../catalog";
import { auditControllers } from "../contract/audit";
import { assemble } from "../spec/assemble";

export type ContractFormat = "json" | "yaml";

async function readOverrides(filename: string): Promise<Partial<Config>> {
  const overrides: unknown = JSON.parse(await readFile(filename, "utf8"));
  if (
    overrides === null ||
    typeof overrides !== "object" ||
    Array.isArray(overrides)
  ) {
    throw new Error("Contract configuration must be a JSON object");
  }
  // assemble validates the merged app configuration, not the overrides alone.
  return overrides;
}

export async function loadContract({
  appDir,
  config,
}: { appDir?: string; config?: string } = {}) {
  const overrides =
    config === undefined ? undefined : await readOverrides(config);
  const { document, coverage } = await withStrapi(
    (app) => assemble(app, overrides),
    { appDir },
  );
  return { document, coverage };
}

export async function writeContract(
  { document, coverage }: { document: OpenAPIDocument; coverage: Coverage },
  {
    out,
    format,
    coverage: coveragePath,
  }: { out?: string; format?: ContractFormat; coverage?: string } = {},
): Promise<string> {
  if (format !== undefined && !["json", "yaml"].includes(format)) {
    throw new Error("Format must be json or yaml");
  }
  const outputFormat =
    format ?? (/^\.ya?ml$/i.test(extname(out ?? "")) ? "yaml" : "json");
  const output = out ?? `specification.${outputFormat}`;
  const json = JSON.stringify(document, null, 2);
  await writeFile(
    output,
    outputFormat === "json" ? `${json}\n` : stringify(JSON.parse(json)),
  );
  if (coveragePath) {
    await writeFile(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`);
  }
  return output;
}

export async function checkContract(
  document: OpenAPIDocument,
  against: string,
): Promise<void> {
  const source = await readFile(against, "utf8");
  const expected: unknown = /\.ya?ml$/i.test(against)
    ? parse(source)
    : JSON.parse(source);
  // Compare the JSON wire representation, not undefined fields that exist only in memory.
  const serialized = JSON.stringify(document);
  const actual: Record<string, unknown> = JSON.parse(serialized);
  if (isDeepStrictEqual(expected, actual)) return;

  if (typeof expected !== "object" || !expected || Array.isArray(expected)) {
    throw new Error(
      `Generated contract differs from ${against} in: document root`,
    );
  }
  const fields = expected as Record<string, unknown>;
  const sections = [
    ...new Set([...Object.keys(fields), ...Object.keys(actual)]),
  ].filter((key) => !isDeepStrictEqual(fields[key], actual[key]));
  throw new Error(
    `Generated contract differs from ${against} in: ${sections.join(", ") || "document root"}`,
  );
}

export async function probeContract(appDir: string) {
  const { ok, checks, routes } = await withStrapi(inspectCatalog, { appDir });
  return {
    ok,
    checks,
    routes: routes.map(({ method, openapiPath: path, handler }) => ({
      method,
      path,
      handler,
    })),
  };
}

export async function auditContract(appDir: string, baseline?: string) {
  if (baseline === undefined) return auditControllers(appDir);
  const hits: unknown = JSON.parse(await readFile(baseline, "utf8"));
  if (
    !Array.isArray(hits) ||
    !hits.every((hit: unknown) => typeof hit === "string")
  ) {
    throw new Error("Audit baseline must be a JSON array of strings");
  }
  return auditControllers(appDir, hits);
}
