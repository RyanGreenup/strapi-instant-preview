import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { vanillaExtractSolid } from "../src/index";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function getVanillaExtractOverride(): unknown {
  const override = vanillaExtractSolid.overrides?.find((entry) =>
    entry.files?.some((glob) => glob.includes("*.css.ts")),
  );
  if (!override) {
    throw new Error("vanillaExtractSolid has no override for src/**/*.css.ts");
  }
  return override;
}

function setupFixtureDir(): {
  testDir: string;
  failingFile: string;
  passingFile: string;
  configFile: string;
} {
  const testDir = mkdtempSync(join(tmpdir(), "oxlint-ve-fixture-"));
  const srcDir = join(testDir, "src");
  mkdirSync(srcDir, { recursive: true });

  const failingFile = join(srcDir, "failing.css.ts");
  writeFileSync(
    failingFile,
    'import { style } from "@vanilla-extract/css";\nexport const a = style({});\n',
  );

  const passingFile = join(srcDir, "passing.css.ts");
  writeFileSync(
    passingFile,
    'import { recipe } from "@vanilla-extract/recipes";\nimport { vars } from "@rs/contract";\nexport const b = recipe({ base: { color: vars.color.current } });\n',
  );

  const config = {
    overrides: [getVanillaExtractOverride()],
  };
  const configFile = join(testDir, ".oxlintrc.json");
  writeFileSync(configFile, JSON.stringify(config));

  return { testDir, failingFile, passingFile, configFile };
}

describe("vanillaExtractSolid oxlint preset behavioral enforcement", () => {
  it("rejects style import in src/**/*.css.ts and accepts recipes and contract imports", () => {
    const { testDir, failingFile, passingFile, configFile } = setupFixtureDir();
    const oxlintBin = join(packageRoot, "node_modules", ".bin", "oxlint");

    try {
      const failResult = spawnSync(oxlintBin, ["-c", configFile, failingFile], {
        cwd: testDir,
        encoding: "utf8",
      });
      expect(failResult.status).toBe(1);
      expect(failResult.stdout + failResult.stderr).toContain(
        "Component styles must use @rs/contract vars/Sprinkles or @vanilla-extract/recipes.",
      );

      const passResult = spawnSync(oxlintBin, ["-c", configFile, passingFile], {
        cwd: testDir,
        encoding: "utf8",
      });
      expect(passResult.status).toBe(0);
      expect(passResult.stdout + passResult.stderr).not.toContain(
        "Component styles must use @rs/contract",
      );
    } finally {
      rmSync(testDir, { force: true, recursive: true });
    }
  }, 30_000);
});
