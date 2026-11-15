import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packages = JSON.parse(
  execFileSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], {
    encoding: "utf8",
  }),
).filter((pkg) => pkg.path !== process.cwd());

const failures = [];
for (const { name, path } of packages) {
  const { scripts = {} } = JSON.parse(
    readFileSync(join(path, "package.json"), "utf8"),
  );
  const required = ["lint", "format", "fix"];
  if (existsSync(join(path, "tsconfig.json"))) required.push("check-types");
  if (["tests", "test"].some((dir) => existsSync(join(path, dir)))) {
    required.push("test");
  }
  for (const script of required) {
    if (!scripts[script]) failures.push(`${name}: missing "${script}" script`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`check-scripts: ${packages.length} packages ok`);
