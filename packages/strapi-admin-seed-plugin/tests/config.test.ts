import { describe, expect, it, vi } from "vitest";

import plugin from "../src/index";

vi.setConfig({ testTimeout: 5000 });

const env = (key: string, fallback?: string): string | undefined =>
  ({ ADMIN_SEED_EMAIL: "Ops@Example.com" })[key] ?? fallback;

describe("config", () => {
  it("rejects an unknown mode", () => {
    expect(() => {
      plugin.config.validator({
        ...plugin.config.default({ env }),
        mode: "sometimes" as never,
      });
    }).toThrow(/mode must be one of once, always/u);
  });

  it("rejects an unknown API token type", () => {
    expect(() => {
      plugin.config.validator({
        ...plugin.config.default({ env }),
        apiTokenType: "custom" as never,
      });
    }).toThrow(/apiTokenType must be one of read-only, full-access/u);
  });
});
