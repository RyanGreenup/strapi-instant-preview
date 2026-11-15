import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startPreviewBridge } from "./index";

const ADMIN = "https://cms.example";
const SCROLL = { left: 3, top: 40, behavior: "instant" };
const SHORTCUT = { ctrlKey: true, altKey: true, shiftKey: false, code: "KeyP" };

const page: { bus: EventTarget; marker: string | undefined } = {
  bus: new EventTarget(),
  marker: ADMIN,
};

const emit = (type: string, properties: Record<string, unknown>): Event => {
  const event = Object.assign(
    new Event(type, { cancelable: true }),
    properties,
  );
  page.bus.dispatchEvent(event);
  return event;
};

vi.setConfig({ testTimeout: 5000 });

describe("startPreviewBridge", () => {
  const admin = {
    postMessage: vi.fn<(message: unknown, origin: string) => void>(),
  };
  const scrollTo = vi.fn<(options: unknown) => void>();
  const reload = vi.fn<() => void>();
  const refresh = vi.fn<() => void>();

  const update = (overrides: Record<string, unknown> = {}): void => {
    emit("message", {
      source: admin,
      origin: ADMIN,
      data: { type: "strapiUpdate" },
      ...overrides,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    page.bus = new EventTarget();
    page.marker = ADMIN;
    vi.stubGlobal("self", globalThis);
    vi.stubGlobal("parent", admin);
    vi.stubGlobal("scrollX", SCROLL.left);
    vi.stubGlobal("scrollY", SCROLL.top);
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal("location", { reload });
    vi.stubGlobal("reportError", vi.fn<(error: unknown) => void>());
    vi.stubGlobal("addEventListener", page.bus.addEventListener.bind(page.bus));
    vi.stubGlobal(
      "removeEventListener",
      page.bus.removeEventListener.bind(page.bus),
    );
    vi.stubGlobal("document", {
      querySelector: () =>
        page.marker === undefined
          ? undefined
          : { dataset: { strapiPreviewOrigin: page.marker } },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes on an update from the admin and restores scrolling", async () => {
    startPreviewBridge({ refresh });
    update();
    await vi.waitFor(() => {
      expect(scrollTo).toHaveBeenCalledExactlyOnceWith(SCROLL);
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("lets the refresh strategy restore scrolling early", () => {
    startPreviewBridge({
      refresh: (restoreScroll) => {
        restoreScroll();
      },
    });
    update();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(SCROLL);
  });

  it("reloads the page by default", () => {
    startPreviewBridge();
    update();
    expect(reload).toHaveBeenCalledOnce();
  });

  it.each([
    ["another window", { source: {} }],
    ["another origin", { origin: "https://evil.example" }],
    ["another message type", { data: { type: "other" } }],
    ["a non-object message", { data: "strapiUpdate" }],
  ])("ignores an update from %s", (_name, overrides) => {
    startPreviewBridge({ refresh });
    update(overrides);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("forwards the toggle shortcut to the admin origin only", () => {
    startPreviewBridge();
    const event = emit("keydown", SHORTCUT);
    emit("keydown", { ...SHORTCUT, shiftKey: true });
    emit("keydown", { ...SHORTCUT, altKey: false });
    expect(event.defaultPrevented).toBe(true);
    expect(admin.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "strapiPreviewToggle" },
      ADMIN,
    );
  });

  it("is idle while the page has no origin page.marker", () => {
    startPreviewBridge({ refresh });
    page.marker = undefined;
    update();
    emit("keydown", SHORTCUT);
    expect(refresh).not.toHaveBeenCalled();
    expect(admin.postMessage).not.toHaveBeenCalled();
    page.marker = ADMIN;
    update();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("prefers an explicit admin origin over the page.marker", () => {
    page.marker = undefined;
    startPreviewBridge({ adminOrigin: ADMIN, refresh });
    update();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("stops listening once stopped", () => {
    startPreviewBridge({ refresh })();
    update();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing outside an iframe", () => {
    vi.stubGlobal("parent", globalThis);
    startPreviewBridge({ adminOrigin: ADMIN, refresh });
    update({ source: globalThis });
    emit("keydown", SHORTCUT);
    expect(refresh).not.toHaveBeenCalled();
    expect(admin.postMessage).not.toHaveBeenCalled();
  });
});
