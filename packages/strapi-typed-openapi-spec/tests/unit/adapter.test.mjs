import { expect, it } from "vitest";
import * as foreign from "zod/v3";

import {
  getZod,
  koaContentRoutes,
  listRouters,
  probe,
  routeIdentity,
  routeShape,
} from "../../dist/server/src/adapter/index.js";
import { defineResponses } from "../../dist/server/src/contract/declarations.js";

const declared = { method: "GET", path: "/x", handler: "articles.find" };
const fn = () => {};

it("accepts Strapi handler forms and extra fields without changing the declaration", () => {
  for (const handler of [declared.handler, fn, [], [fn, fn]]) {
    const route = Object.freeze({
      ...declared,
      path: " /x ",
      handler,
      info: null,
      config: null,
      request: null,
      response: null,
      extra: 1,
    });
    expect(routeShape(route)).toBe(true);
  }
  for (const auth of [false, null, { scope: [] }]) {
    expect(
      routeShape({
        ...declared,
        info: { apiName: null, type: null, pluginName: null },
        config: { prefix: null, auth, policies: [] },
        request: {},
        response: {},
      }),
    ).toBe(true);
  }
});

it.each([
  { method: 1 },
  { path: null },
  { path: " relative" },
  { handler: null },
  { handler: [fn, 1] },
  { info: [] },
  { info: { type: 1 } },
  { info: { apiName: false } },
  { info: { pluginName: {} } },
  { config: [] },
  { config: { prefix: false } },
  { config: { auth: true } },
  { request: [] },
  { response: "bad" },
])("rejects malformed declared route fields: %j", (fields) => {
  expect(routeShape({ ...declared, ...fields })).toBe(false);
});

it("normalizes runtime identity without requiring declared-route fields", () => {
  for (const [names, source] of [
    [{}, ""],
    [{ apiName: "articles", pluginName: "p" }, "api::articles"],
    [{ apiName: "", pluginName: "p" }, "api::"],
    [{ apiName: 1, pluginName: "p" }, "plugin::p"],
    [{ pluginName: 1 }, ""],
  ]) {
    expect(
      routeIdentity({
        method: " get ",
        path: " relative ",
        info: { type: "content-api", ...names },
      }),
    ).toEqual({ type: "content-api", source, method: "GET", path: "relative" });
  }
});

it.each([
  { info: undefined },
  { info: {} },
  { info: { type: 1 } },
  { method: 1 },
  { path: [] },
])("returns no runtime identity for malformed fields: %j", (fields) => {
  expect(
    routeIdentity({
      method: "GET",
      path: "/x",
      info: { type: "content-api" },
      ...fields,
    }),
  ).toBeUndefined();
});

it("keeps original valid layers and uses the top-level stack only as a fallback", () => {
  const valid = { path: "/x", methods: ["GET", "HEAD"] };
  const api = {
    listRoutes: () => [
      valid,
      { path: "/empty", methods: [] },
      { path: "/bad", methods: ["GET", 7] },
    ],
  };
  const listRoutes = () => [{ path: "/top", methods: ["GET"] }];
  const layers = koaContentRoutes({ server: { api: () => api, listRoutes } });
  expect(layers).toEqual([valid]);
  expect(layers[0]).toBe(valid);
  expect(koaContentRoutes({ server: { listRoutes } })).toEqual(listRoutes());
  expect(
    koaContentRoutes({
      server: { api: () => ({ listRoutes: () => [] }), listRoutes },
    }),
  ).toEqual([]);
  expect(koaContentRoutes({ server: {} })).toBeUndefined();
});

it("defaults nullable router metadata and mounts bare plugin arrays as admin", () => {
  const routes = [declared];
  const bare = [{ ...declared, info: { type: "content-api" } }];
  const [api, plugin] = listRouters({
    apis: {
      articles: { routes: { main: { routes, type: null, prefix: null } } },
    },
    plugins: { sample: { routes: bare } },
  });
  expect(api).toMatchObject({ type: "content-api", prefix: "" });
  expect(api.routes).toBe(routes);
  expect(plugin).toMatchObject({ type: "admin", prefix: "/sample" });
  expect(plugin.routes).toBe(bare);
});

it.each([
  { routes: {} },
  { routes: [], type: 1 },
  { routes: [], prefix: false },
])(
  "identifies the malformed router in the existing diagnostic: %j",
  (router) => {
    expect(() =>
      listRouters({
        apis: { articles: { routes: { main: router } } },
        plugins: {},
      }),
    ).toThrow(/^Invalid router api::articles\.main$/);
  },
);

const app = {
  dirs: { app: { root: process.cwd() } },
  config: { get: (_, fallback) => fallback },
  server: {},
  contentTypes: {},
  components: {},
};
const z = getZod(app);
const router = (routes) => [
  { type: "content-api", source: { kind: "api", name: "articles" }, routes },
];

it.each([
  [{ request: { query: [] } }, "request.query"],
  [{ request: { params: { id: foreign.string() } } }, "request.params.id"],
  [
    { request: { body: { "application/json": null } } },
    "request.body.application/json",
  ],
  [{ response: { 201: foreign.string() } }, "HTTP status 201"],
])(
  "checks upstream schemas even when a response declaration takes precedence",
  (fields, detail) => {
    const route = defineResponses(
      { ...declared, ...fields },
      { 200: z.string() },
    );
    const result = probe(app, router([route])).failures.find(
      (check) => check.name === "App Zod",
    );
    expect(result?.detail).toContain("api::articles GET /x");
    expect(result.detail).toContain(detail);
  },
);

it("accepts an absent request group and a bodyless upstream status", () => {
  const route = {
    ...declared,
    request: { query: undefined },
    response: { 201: z.string(), 204: null },
  };
  expect(
    probe(app, router([route])).checks.find(
      (check) => check.name === "App Zod",
    ),
  ).toMatchObject({ status: "ok", detail: "1 route schemas share app Zod" });
});

it("reports a malformed mounted method in Route fields", () => {
  const server = {
    listRoutes: () => [{ path: "/broken", methods: ["GET", 42] }],
  };
  expect(probe({ ...app, server }, router([])).failures).toContainEqual({
    name: "Route fields",
    status: "failed",
    detail: "Invalid mounted Koa routes: /broken",
  });
});
