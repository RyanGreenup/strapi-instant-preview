import { describe, expect, it } from "vitest";

import { fn } from "../src/index";

describe("fn", () => {
  it("returns the greeting", { timeout: 1000 }, () => {
    expect(fn()).toBe("Hello, tsdown!");
  });
});
