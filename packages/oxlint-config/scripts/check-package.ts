import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isRecord, isUnknownArray, parseJson } from "./generate/guards.ts";

interface PackageManifest {
  readonly exports: Record<string, unknown>;
  readonly name: string;
}

async function readManifest(): Promise<PackageManifest> {
  const parsed = parseJson(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("package.json is not an object");
  }

  const { exports, name } = parsed;
  if (!isRecord(exports) || typeof name !== "string") {
    throw new Error("package.json is missing a name or an exports map");
  }

  return { exports, name };
}

/** Paths `npm pack` would ship, in the `./relative` form used by the exports map. */
function readPackedFiles(): ReadonlySet<string> {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  const parsed = parseJson(output);
  if (!isUnknownArray(parsed)) {
    throw new Error("npm pack did not report an array");
  }

  const [pack] = parsed;
  if (!isRecord(pack) || !isUnknownArray(pack["files"])) {
    throw new Error("npm pack did not report a file list");
  }

  const packed = new Set<string>();
  for (const file of pack["files"]) {
    if (isRecord(file) && typeof file["path"] === "string") {
      packed.add(`./${file["path"]}`);
    }
  }

  return packed;
}

/** The file targets an exports entry points at, whether or not it uses conditions. */
function exportTargets(conditions: unknown): readonly string[] {
  if (typeof conditions === "string") {
    return [conditions];
  }
  if (!isRecord(conditions)) {
    throw new Error(`unsupported exports entry: ${JSON.stringify(conditions)}`);
  }

  return Object.values(conditions).filter((target) => typeof target === "string");
}

const manifest = await readManifest();
const packedFiles = readPackedFiles();

for (const [subpath, conditions] of Object.entries(manifest.exports)) {
  for (const target of exportTargets(conditions)) {
    if (target.startsWith("./src/")) {
      throw new Error(`${subpath} exposes unpublished source: ${target}`);
    }
    if (target !== "./package.json" && !packedFiles.has(target)) {
      throw new Error(`${subpath} points to a file missing from the package: ${target}`);
    }
    if (target.endsWith(".mjs")) {
      const declaration = target.replace(/\.mjs$/u, ".d.mts");
      if (!packedFiles.has(declaration)) {
        throw new Error(`${subpath} is missing its declaration file: ${declaration}`);
      }
    }
  }
}

const publicApi: unknown = await import(manifest.name);
if (!isRecord(publicApi)) {
  throw new Error(`${manifest.name} did not resolve to a module namespace`);
}
if (
  Object.keys(publicApi).toSorted().join(",") !==
  "base,cliCfg,electron,playwright,react,solid,tanstackRouter,vite"
) {
  throw new Error(`Unexpected public API: ${Object.keys(publicApi).toSorted().join(",")}`);
}

await Promise.all([
  import(`${manifest.name}/plugins/solid`),
  import(`${manifest.name}/plugins/solid-ref-pattern`),
  import(`${manifest.name}/plugins/sonarjs`),
]);
