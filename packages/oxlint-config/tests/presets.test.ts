import { describe, expect, it } from "vitest";

import {
  base,
  electron,
  playwright,
  react,
  solid,
  tanstackRouter,
  vanillaExtractSolid,
  vite,
} from "../src/index.ts";

/** The whole module, to assert on the export surface rather than a known name. */
const publicApi = await import("../src/index.ts");

describe("public presets", () => {
  it("exports the public presets", () => {
    expect(Object.keys(publicApi).toSorted()).toStrictEqual([
      "base",
      "cliCfg",
      "electron",
      "playwright",
      "react",
      "solid",
      "tanstackRouter",
      "vanillaExtractSolid",
      "vite",
    ]);
  }, 5000);

  it("provides Solid as a complete preset built on base", () => {
    expect(solid.extends).toContain(base);
    expect(solid.jsPlugins).toContainEqual({
      name: "solid-js-custom",
      specifier: "@rs/oxlint-config/plugins/solid-ref-pattern",
    });
  }, 5000);

  it("provides strict React linting without dropping the base plugins", () => {
    expect(react.extends).toContain(base);
    expect(react.extends).toHaveLength(1);
    expect([
      react.plugins?.includes("jsx-a11y"),
      react.plugins?.includes("react"),
    ]).toStrictEqual([true, true]);
    expect(react).toMatchObject({
      options: {
        reportUnusedDisableDirectives: "error",
        typeAware: true,
        typeCheck: true,
      },
    });
    expect(react.rules).toMatchObject({
      "react/exhaustive-deps": "error",
      "react/jsx-filename-extension": [
        "error",
        { extensions: [".jsx", ".tsx"] },
      ],
      "react/jsx-no-target-blank": "error",
      "react/no-danger": "error",
      "react/no-unknown-property": "error",
      "react/no-unsafe": "error",
      "react/only-export-components": ["warn", { allowConstantExport: true }],
      "react/react-in-jsx-scope": "off",
      "react/rules-of-hooks": "error",
    });
  }, 5000);

  it("supports Panda's CommonJS configuration contract", () => {
    expect(base.overrides).toContainEqual({
      files: ["panda.config.ts"],
      rules: {
        "unicorn/prefer-module": "off",
      },
    });
  }, 5000);

  it("provides composable integration presets", () => {
    expect(electron.overrides).toBeDefined();
    expect(playwright.overrides).toBeDefined();
    expect(tanstackRouter.overrides).toBeDefined();
    expect(vite.overrides).toBeDefined();
  }, 5000);

  it("provides vanillaExtractSolid extending solid with style import restriction", () => {
    expect(vanillaExtractSolid.extends).toContain(solid);
    expect(vanillaExtractSolid.overrides).toContainEqual({
      files: ["src/**/*.css.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@vanilla-extract/css",
                importNames: ["style"],
                message:
                  "Component styles must use @rs/contract vars/Sprinkles or @vanilla-extract/recipes.",
              },
            ],
          },
        ],
      },
    });
  }, 5000);
});
