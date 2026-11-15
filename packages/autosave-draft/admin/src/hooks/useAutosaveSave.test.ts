import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AutosaveContext, Values } from "./useAutosaveContext";
import type { AutosaveController } from "./useAutosaveSession";

import { useAutosaveSave } from "./useAutosaveSave";

vi.setConfig({ testTimeout: 2000 });
const noop = (): void => {
  /* State setters are inert in this server-rendered harness. */
};
const notRendered = (): Promise<boolean> =>
  Promise.reject(new Error("Harness not rendered"));

describe("autosave draft requests", () => {
  it.each([
    {
      scenario: "omits conditionally hidden fields",
      nested: { id: 1, showDetails: false, details: "Nested hidden" },
      expectedNested: { id: 1, showDetails: false },
    },
    {
      scenario: "preserves a missing component from the baseline as Save does",
      nested: undefined,
      expectedNested: { id: 1, showDetails: false, details: "Baseline hidden" },
    },
  ])(
    "autosave $scenario in the draft request",
    async ({ nested, expectedNested }) => {
      let body: unknown = null;
      const values = {
        title: "Edited",
        showDetails: false,
        details: "Hidden value",
        shared: "Shared across locales",
        nested,
      };
      const context = {
        initialValues: {
          ...values,
          nested: { id: 1, showDetails: false, details: "Baseline hidden" },
        },
        attributes: {
          title: { type: "string" },
          showDetails: { type: "boolean" },
          details: {
            type: "string",
            conditions: { visible: { "==": [{ var: "showDetails" }, true] } },
          },
          shared: {
            type: "string",
            pluginOptions: { i18n: { localized: false } },
          },
          nested: { type: "component", component: "example.details" },
        },
        components: {
          "example.details": {
            attributes: {
              showDetails: { type: "boolean" },
              details: {
                type: "string",
                conditions: {
                  visible: { "==": [{ var: "showDetails" }, true] },
                },
              },
            },
          },
        },
        documentArgs: { params: { locale: "fr" } },
        cachedDocument: { id: 1, documentId: "existing", locale: "fr" },
        getValues: () => values,
        validate: () => Promise.resolve({}),
        refetch: noop,
        key: "conditional-regression",
        saveDraft: ({ data }: { data: unknown }) => {
          body = data;
          return { unwrap: () => Promise.resolve({ didUpdateCache: true }) };
        },
      } as unknown as AutosaveContext;
      const controller: AutosaveController = {
        latest: { current: context },
        isBusy: { current: false },
        lastSent: { current: undefined },
        failedFor: { current: undefined },
        awaitingReload: { current: undefined },
        setPhase: noop,
        setLastSavedAt: noop,
        setDetail: noop,
        setSnapshot: noop,
        setIsReverting: noop,
        setSaveCount: noop,
      };
      let save: (override?: Values) => Promise<boolean> = notRendered;
      const Harness = (): null => {
        save = useAutosaveSave(controller);
        return null;
      };
      try {
        renderToStaticMarkup(createElement(Harness));
        await expect(save()).resolves.toBe(true);
        expect(body).toStrictEqual({
          title: "Edited",
          showDetails: false,
          shared: "Shared across locales",
          nested: expectedNested,
        });
      } finally {
        clearTimeout(controller.awaitingReload.current?.timeout);
      }
    },
  );
});

describe("autosave cache misses", () => {
  it("warns once and refetches when no cached document matched", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(noop);
    const refetch = vi.fn<() => void>();
    const context = {
      initialValues: {},
      attributes: undefined,
      components: {},
      documentArgs: {},
      cachedDocument: { id: 1 },
      getValues: () => ({ title: "Edited" }),
      validate: () => Promise.resolve({}),
      refetch,
      key: "cache-miss",
      saveDraft: () => ({
        unwrap: () => Promise.resolve({ didUpdateCache: false }),
      }),
    } as unknown as AutosaveContext;
    const controller: AutosaveController = {
      latest: { current: context },
      isBusy: { current: false },
      lastSent: { current: undefined },
      failedFor: { current: undefined },
      awaitingReload: { current: undefined },
      setPhase: noop,
      setLastSavedAt: noop,
      setDetail: noop,
      setSnapshot: noop,
      setIsReverting: noop,
      setSaveCount: noop,
    };
    let save: (override?: Values) => Promise<boolean> = notRendered;
    const Harness = (): null => {
      save = useAutosaveSave(controller);
      return null;
    };
    try {
      renderToStaticMarkup(createElement(Harness));
      // Each override is a separate save of the same document.
      await expect(save({ title: "First" })).resolves.toBe(true);
      await expect(save({ title: "Second" })).resolves.toBe(true);
      expect(refetch).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(/^draft-autosave: .*cached document/u),
      );
    } finally {
      clearTimeout(controller.awaitingReload.current?.timeout);
      warn.mockRestore();
    }
  });
});
