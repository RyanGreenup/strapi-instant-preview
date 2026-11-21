import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const bin = fileURLToPath(
  new URL("../../bin/openapi-contract.js", import.meta.url),
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
    expect(result.stdout).toContain("client");
    expect(result.stdout).toContain("--out");
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
