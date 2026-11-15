import { defineConfig as defineOxConfig } from "oxlint";
import type { OxlintConfig } from "oxlint";

import { solid } from "./solid";

export const vanillaExtractSolid: OxlintConfig = defineOxConfig({
  extends: [solid],
  overrides: [
    {
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
    },
  ],
});
