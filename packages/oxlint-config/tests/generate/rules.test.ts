import { describe, expect, it } from "vitest";
import { collectRules } from "../../scripts/generate/rules/collect-rules.ts";
import { normalizeLevel } from "../../scripts/generate/rules/normalize-level.ts";

describe("normalizeLevel", () => {
  it.each([
    [0, "off"],
    [1, "warn"],
    [2, "error"],
    [3, 3],
    ["warn", "warn"],
  ])(
    "normalizes %j to %j",
    (input, expected) => {
      expect(normalizeLevel(input)).toStrictEqual(expected);
    },
    5000,
  );

  it("normalizes only the severity in a rule tuple", () => {
    const options = { allow: ["value"] };

    expect(normalizeLevel([2, options])).toStrictEqual(["error", options]);
  }, 5000);
});

describe("collectRules", () => {
  it("merges config blocks in order and normalizes their severities", () => {
    expect(
      collectRules([
        { rules: { first: 2, overridden: 1 } },
        // A blockless entry: flat configs carry these, and they must not throw.
        undefined,
        { rules: { overridden: 0, tuple: [1, "option"] } },
      ]),
    ).toStrictEqual({
      first: "error",
      overridden: "off",
      tuple: ["warn", "option"],
    });
  }, 5000);

  it("returns an empty rule map for a config without rules", () => {
    expect(collectRules({ plugins: {} })).toStrictEqual({});
  }, 5000);
});
