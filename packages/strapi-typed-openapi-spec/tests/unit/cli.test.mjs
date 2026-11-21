import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const bin = fileURLToPath(
  new URL("../../bin/openapi-contract.js", import.meta.url),
);
const run = (...args) =>
  spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
const usage = `Usage: openapi-contract <command> [--app <directory>]

  generate [--out specification.json] [--format json|yaml] [--coverage coverage.json] [--config config.json]
  check    [--against specification.json] [--config config.json]
  probe
  audit    [--baseline audit.json]
`;

test.each(["generate", "check", "probe", "audit", undefined])(
  "prints help without booting %s",
  (command) => {
    const result = command
      ? run(command, "--app", "/nonexistent", "-h")
      : run("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(usage);
  },
);

test("rejects unknown commands and command-specific options", () => {
  const unknown = run("missing");
  expect(unknown.status).toBe(1);
  expect(unknown.stderr).toContain("Unknown command missing");
  const invalid = run("probe", "--format", "yaml");
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain("Unknown option '--format'");
});
