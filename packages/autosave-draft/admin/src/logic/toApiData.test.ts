import { describe, expect, it, vi } from "vitest";

import { toApiData } from "./toApiData";

vi.setConfig({ testTimeout: 1000 });

describe("toApiData", () => {
  it("leaves plain values alone", () => {
    const values = { title: "a", count: 2, on: false, none: null, tags: ["x"] };

    expect(toApiData(values)).toStrictEqual(values);
  });

  it("replaces an object that carries apiData with that apiData", () => {
    const values = {
      author: {
        connect: [
          {
            id: 1,
            label: "Ann",
            apiData: { id: 1, documentId: "d1", locale: null },
          },
        ],
        disconnect: [],
      },
    };

    expect(toApiData(values)).toStrictEqual({
      author: {
        connect: [{ id: 1, documentId: "d1", locale: null }],
        disconnect: [],
      },
    });
  });

  it("reaches relations inside components and dynamic zones", () => {
    const values = {
      blocks: [
        {
          __component: "a.b",
          rel: { connect: [{ apiData: { id: 2 } }], disconnect: [] },
        },
      ],
    };

    expect(toApiData(values)).toStrictEqual({
      blocks: [
        { __component: "a.b", rel: { connect: [{ id: 2 }], disconnect: [] } },
      ],
    });
  });

  it("does not change its input", () => {
    const values = { rel: { connect: [{ apiData: { id: 2 } }] } };

    toApiData(values);

    expect(values).toStrictEqual({
      rel: { connect: [{ apiData: { id: 2 } }] },
    });
  });
});
