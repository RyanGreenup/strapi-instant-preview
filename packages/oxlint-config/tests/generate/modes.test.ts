import { describe, expect, it } from "vitest";
import { createJsPluginConfig } from "../../scripts/generate/modes/js-plugin.ts";
import { migrateConfig } from "../../scripts/generate/modes/migrate.ts";
import type { PluginSpec } from "../../scripts/generate/plugins/types.ts";

const jsPluginSpec: PluginSpec = {
  name: "fixture",
  specifier: "fixture",
  mode: "jsPlugin",
  jsPluginName: "fixture",
  jsPluginSpecifier: "eslint-plugin-fixture",
  pick: (module) => module.default,
};

describe("createJsPluginConfig", () => {
  it("adds the runtime plugin and normalized rules", () => {
    expect(createJsPluginConfig(jsPluginSpec, { rules: { rule: 2 } })).toStrictEqual({
      jsPlugins: [{ name: "fixture", specifier: "eslint-plugin-fixture" }],
      rules: { rule: "error" },
    });
  }, 5000);

  it("rejects a jsPlugin spec without a runtime specifier", () => {
    const specWithoutSpecifier: PluginSpec = {
      name: "fixture",
      specifier: "fixture",
      mode: "jsPlugin",
      jsPluginName: "fixture",
      pick: (module) => module.default,
    };

    expect(() => createJsPluginConfig(specWithoutSpecifier, {})).toThrow(
      "fixture requires jsPluginName and jsPluginSpecifier in jsPlugin mode",
    );
  }, 5000);
});

describe("migrateConfig", () => {
  it("removes migration categories from the generated config", async () => {
    const migrated = await migrateConfig({ rules: { "no-debugger": "error" } });

    expect(migrated).not.toHaveProperty("categories");
    expect(migrated).toHaveProperty(["rules", "no-debugger"]);
  }, 5000);
});
