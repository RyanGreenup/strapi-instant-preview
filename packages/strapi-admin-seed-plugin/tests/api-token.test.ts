import { afterEach, describe, expect, it, vi } from "vitest";

import type { SeedStrapi } from "../src/services/seed";

import plugin from "../src/index";

vi.setConfig({ testTimeout: 5000 });

const KEY = "0123456789abcdef0123456789abcdef";

type Row = Record<string, unknown>;

/** A Strapi with one table of API tokens, and a hash that is easy to read. */
function fakeStrapi(rows: Row[]): SeedStrapi {
  return {
    config: {
      get: () => ({
        ...plugin.config.default({ env: (_key, fallback) => fallback }),
        apiTokenName: "preview",
        apiTokenEnv: "ADMIN_SEED_API_TOKEN",
      }),
    },
    service: () => ({ hash: (key: string) => `hash:${key}` }),
    store: () => ({
      get: async () => {
        await Promise.resolve();
        return null;
      },
      set: async () => {
        await Promise.resolve();
        return null;
      },
    }),
    db: {
      query: () => ({
        findOne: async ({ where }) => {
          await Promise.resolve();
          return rows.find((row) => row["name"] === where["name"]);
        },
        create: async ({ data }) => {
          await Promise.resolve();
          rows.push({ id: rows.length + 1, ...data });
          return data;
        },
        update: async ({ where, data }) => {
          await Promise.resolve();
          Object.assign(
            rows.find((row) => row["id"] === where["id"]) ?? {},
            data,
          );
          return data;
        },
      }),
    },
    log: { info: vi.fn<(message: string) => void>() },
  };
}

async function run(rows: Row[]): Promise<void> {
  await plugin.services.seed({ strapi: fakeStrapi(rows) }).run();
}

describe("seed of the API token", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a read-only content API token with the hash of the key", async () => {
    vi.stubEnv("ADMIN_SEED_API_TOKEN", KEY);
    const rows: Row[] = [];

    await run(rows);
    await run(rows);

    expect(rows).toStrictEqual([
      expect.objectContaining({
        name: "preview",
        kind: "content-api",
        type: "read-only",
        accessKey: `hash:${KEY}`,
        lifespan: null,
      }),
    ]);
  });

  it("gives an existing token of that name the key of the environment", async () => {
    vi.stubEnv("ADMIN_SEED_API_TOKEN", KEY);
    const rows: Row[] = [
      { id: 7, name: "preview", type: "full-access", accessKey: "hash:old" },
    ];

    await run(rows);

    expect(rows).toStrictEqual([
      expect.objectContaining({
        id: 7,
        type: "read-only",
        accessKey: `hash:${KEY}`,
      }),
    ]);
  });

  it("does nothing when the environment has no token", async () => {
    const rows: Row[] = [];

    await run(rows);

    expect(rows).toStrictEqual([]);
  });

  it("refuses a short token", async () => {
    vi.stubEnv("ADMIN_SEED_API_TOKEN", "short");

    await expect(run([])).rejects.toThrow(/at least 32 characters/u);
  });
});
