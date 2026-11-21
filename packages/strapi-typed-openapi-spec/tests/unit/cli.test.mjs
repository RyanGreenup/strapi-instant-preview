import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);
const manifest =
  require.resolve("@ryangreenup/strapi-typed-openapi-spec/package.json");
const bin = createRequire(manifest).resolve(
  require(manifest).bin["openapi-contract"],
);
const run = (...args) =>
  spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });

test.each(["generate", "client", "check", "probe", "audit", undefined])(
  "prints help without booting %s",
  (command) => {
    const result = command
      ? run(command, "--app", "/nonexistent", "-h")
      : run("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(command ? "--app" : "client");
  },
);

test("rejects unknown commands and command-specific options", () => {
  const unknown = run("missing");
  expect(unknown.status).toBe(1);
  expect(unknown.stderr).toContain("missing");
  const invalid = run("probe", "--format", "yaml");
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain("Unknown option '--format'");
});
