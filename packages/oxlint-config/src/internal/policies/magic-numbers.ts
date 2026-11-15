import { defineConfig } from "oxlint";

export const magicNumbers = defineConfig({
  rules: {
    "no-magic-numbers": [
      "warn",
      {
        ignore: [-1, 0, 1, 2, 100, 1000],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        ignoreClassFieldInitialValues: true,
        // A descriptive const is the correct fix for a magic number.
        enforceConst: true,
        detectObjects: false,
        // TS-specific (supported by oxlint's port)
        ignoreEnums: true,
        ignoreNumericLiteralTypes: true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes: true,
      },
    ],
  },
  overrides: [
    {
      files: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
      rules: { "no-magic-numbers": "off" },
    },
    {
      files: ["**/*.config.*", "**/constants.*", "**/tokens.*"],
      rules: { "no-magic-numbers": "off" },
    },
  ],
});
