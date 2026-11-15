import type { StrapiApp } from "@strapi/strapi/admin";

import { afterEach, describe, expect, it, vi } from "vitest";

import plugin from "./index";

// Bootstrap does not use Strapi's query cache; isolate this external host service.
// oxlint-disable-next-line vitest/prefer-import-in-mock -- This intentionally models only the host service used during module initialization.
vi.mock("@strapi/strapi/admin", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  adminApi: { util: {}, injectEndpoints: () => ({}) },
}));
// UI components are not rendered by the plugin lifecycle.
vi.mock(import("@strapi/design-system"), () => ({}));

vi.setConfig({ testTimeout: 2000 });

describe("admin bootstrap compatibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { scenario: "missing side-panel method", contentManager: { apis: {} } },
    { scenario: "missing Content Manager", contentManager: undefined },
    { scenario: "missing API container", contentManager: {} },
    { scenario: "null API container", contentManager: { apis: null } },
    {
      scenario: "non-callable side-panel method",
      contentManager: { apis: { addEditViewSidePanel: true } },
    },
  ])("disables only autosave for $scenario", ({ contentManager }) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      /* Capture host diagnostics. */
    });
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- A partial host exercises removed APIs that Strapi's current types cannot represent.
    const app = { getPlugin: () => contentManager } as unknown as StrapiApp;
    plugin.bootstrap?.(app);

    expect(warning).toHaveBeenCalledWith(
      expect.stringMatching(/addEditViewSidePanel.*disabled/u),
    );
  });
});
