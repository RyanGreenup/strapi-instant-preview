import { createRequire } from "node:module";
import { expect, test } from "vitest";

// Plain require: the middleware is the CommonJS `exports.default`.
const runtimeModule = createRequire(import.meta.url)(
  "../../dist/server/src/runtime/index.js",
);
const { runtime } = runtimeModule;
const validateResponses = runtimeModule.default;

function fakeApp() {
  const errors = [];
  return {
    errors,
    log: { error: (message) => errors.push(message), warn() {} },
  };
}

const route = (path) => ({
  method: "GET",
  path,
  info: { type: "content-api", apiName: "article" },
});

function context({ method = "GET", path, matched = path, body, status = 200 }) {
  return {
    method,
    status,
    body,
    query: {},
    state: { route: route(path) },
    _matchedRoute: matched,
    get: () => "",
    response: { get: () => "" },
  };
}

test("a route without catalog data is reported without turning checks off", async () => {
  const app = fakeApp();
  const rt = runtime(app);
  const mismatch = () => ({ kind: "schema-mismatch", issues: ["/: wrong"] });
  Object.assign(rt, {
    enabled: true,
    failOn: "error",
    lookup: new Map([["GET /articles", mismatch]]),
  });
  const middleware = validateResponses({}, { strapi: app });
  const next = async () => {};

  const unmatched = context({ path: "/unknown", body: { data: null } });
  await middleware(unmatched, next);
  expect(unmatched.status).toBe(200);
  expect(rt.enabled).toBe(true);
  expect(rt.violations).toEqual([
    {
      route: "GET /unknown",
      status: 200,
      kind: "missing-coverage",
      issues: ["no catalog entry"],
    },
  ]);

  // The next covered route is still checked and its violation reported.
  const covered = context({ path: "/articles", body: { data: [] } });
  await middleware(covered, next);
  expect(covered.status).toBe(500);
  expect(rt.violations.map((violation) => violation.kind)).toEqual([
    "missing-coverage",
    "schema-mismatch",
  ]);
  expect(rt.enabled).toBe(true);
  expect(app.errors).toHaveLength(2);
});

test("intentional exclusions are not coverage failures", async () => {
  const app = fakeApp();
  const rt = runtime(app);
  Object.assign(rt, { enabled: true, lookup: new Map() });
  const middleware = validateResponses({}, { strapi: app });
  await middleware(
    context({ method: "HEAD", path: "/unknown", body: null }),
    async () => {},
  );
  await middleware(
    context({ path: "/unknown", body: Buffer.from("file") }),
    async () => {},
  );
  expect(rt.violations).toEqual([]);
});
