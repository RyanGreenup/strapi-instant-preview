import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const config = join(root, ".dependency-cruiser.cjs");
const bin = join(root, "node_modules", ".bin", "depcruise");
const packages = JSON.parse(
  execFileSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], {
    encoding: "utf8",
  }),
).filter(
  (pkg) => pkg.path !== root && existsSync(join(pkg.path, "tsconfig.json")),
);

const failures = [];
for (const { name, path } of packages) {
  console.log(`depcruise: ${name}`);
  const project = ts.getParsedCommandLineOfConfigFile(
    join(path, "tsconfig.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );
  if (project.errors.length > 0) {
    for (const diagnostic of project.errors) {
      console.error(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      );
    }
    failures.push(name);
    continue;
  }
  // Rules and tsconfig paths are package-relative. Disable the cache because
  // dependency declarations can change without source files changing.
  const { status, error } = spawnSync(
    bin,
    [
      ...project.fileNames.map((file) => relative(path, file)),
      "--config",
      config,
      "--output-type",
      "err",
      "--progress",
      "none",
      "--no-cache",
    ],
    { cwd: path, stdio: "inherit" },
  );
  if (error) console.error(error.message);
  if (status !== 0) failures.push(name);
}

if (failures.length > 0) {
  console.error(`depcruise failed: ${failures.join(", ")}`);
  process.exit(1);
}
