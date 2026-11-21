import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

// Generates a client from the fixture app's contract and calls the live app
// with it. Run with `--pool=threads`: booting Strapi in a forked worker
// breaks vitest's IPC channel.

const require = createRequire(import.meta.url);
const { bootTestApp } = require("../../dist/server/src/testing/index.js");
const { generateClient } = require("../../dist/server/src/tooling/index.js");

const appDir = join(import.meta.dirname, "../fixture-app");
// Inside the package, so the client resolves zod from its node_modules.
const output = join(import.meta.dirname, "../.tmp/generated-client-test");
const password = "fixture-password-only!";

let app;
let databaseDir;
let baseUrl;
let token;
let checked;
let unchecked;
let warnings;

beforeAll(async () => {
  const env = { ...process.env };
  databaseDir = await mkdtemp(join(tmpdir(), "openapi-contract-client-"));
  process.env.DATABASE_FILENAME = join(databaseDir, "app.sqlite");
  process.env.FIXTURE_EXPOSE_SPEC = "true";
  try {
    app = await bootTestApp({ appDir });
  } finally {
    process.env = env;
  }
  const { port } = app.strapi.server.httpServer.address();
  baseUrl = `http://127.0.0.1:${port}/content`;
  const registration = await app.request
    .post("/content/auth/local/register")
    .send({ username: "client", email: "client@example.test", password })
    .expect(200);
  token = registration.body.jwt;
  const spec = await app.request
    .get("/content/openapi-contract/spec.json")
    .set("authorization", `Bearer ${token}`)
    .expect(200);

  await rm(output, { recursive: true, force: true });
  warnings = await generateClient(spec.body, output);
  checked = await import(join(output, "index.ts"));
  unchecked = await import(join(output, "unchecked.ts"));
}, 120_000);

afterAll(async () => {
  try {
    await app?.destroy();
  } finally {
    if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
  }
});

const bind = (module, options = {}) =>
  module.bindClient(module.createCmsClient({ baseUrl, token, ...options }), {
    find: module.apiArticleArticleFind,
    findOne: module.apiArticleArticleFindOne,
  });

test("every 2xx JSON schema in the fixture contract is validated", () => {
  expect(warnings).toEqual([]);
});

test("a 2xx body is validated and returned as ok", async () => {
  const result = await bind(checked).find({ pagination: { pageSize: 1 } });
  expect(result.ok).toBe(true);
  expect(result.value.status).toBe(200);
  expect(Array.isArray(result.value.data.data)).toBe(true);
});

test("an error status becomes an HttpError with the parsed body", async () => {
  const result = await bind(checked).findOne("missing-document");
  expect(result.ok).toBe(false);
  expect(result.error).toBeInstanceOf(checked.HttpError);
  expect(result.error.kind).toBe("http");
  expect(result.error.status).toBe(404);
  expect(result.error.data.error.status).toBe(404);
  expect(result.error.url).toBe(`${baseUrl}/articles/missing-document`);
  expect(result.error.method).toBe("GET");
});

// Serve a 200 whose body breaks the contract.
const tampered = async (input, init) => {
  const response = await fetch(input, init);
  const body = await response.json();
  return Response.json({ ...body, data: "not a list" }, { status: 200 });
};

test("a body that breaks the contract is a ValidationError", async () => {
  const result = await bind(checked, { fetch: tampered }).find();
  expect(result.ok).toBe(false);
  expect(result.error.kind).toBe("validation");
  expect(result.error.status).toBe(200);
  expect(result.error.issues[0].path).toEqual(["data"]);
  expect(result.error.received.data).toBe("not a list");
});

test("conditional rules (if/then) are enforced", async () => {
  const time = "2026-01-01T00:00:00.000Z";
  const card = {
    id: 1,
    documentId: "a00000000000000000000001",
    label: "Docs",
    url: null,
    email: null,
    createdAt: time,
    updatedAt: time,
    publishedAt: time,
  };
  const serve = (kind) => async (input, init) => {
    const body = await (await fetch(input, init)).json();
    return Response.json({ ...body, data: [{ ...card, kind }] });
  };
  const call = (kind) =>
    checked
      .bindClient(
        checked.createCmsClient({ baseUrl, token, fetch: serve(kind) }),
        { find: checked.apiLinkCardLinkCardFind },
      )
      .find();

  // A topic card may leave `url` null; an external card may not.
  const topic = await call("topic");
  expect(topic.ok).toBe(true);
  const external = await call("external");
  expect(external.error.kind).toBe("validation");
  expect(external.error.issues.map((issue) => issue.code)).toContain("if");
});

test("unchecked operations skip validation", async () => {
  const result = await bind(unchecked, { fetch: tampered }).find();
  expect(result.ok).toBe(true);
  expect(result.value.data.data).toBe("not a list");
});

test("transport failures are classified, never thrown", async () => {
  // Never responds: only the client's timeout ends the request.
  const hang = async (_input, init) => {
    await once(init.signal, "abort");
    throw init.signal.reason;
  };

  const timeout = await bind(checked, { fetch: hang, timeoutMs: 5 }).find();
  expect(timeout.error.kind).toBe("timeout");

  const controller = new AbortController();
  controller.abort();
  const aborted = await bind(checked).find(undefined, {
    signal: controller.signal,
  });
  expect(aborted.error.kind).toBe("aborted");

  const network = await checked
    .bindClient(checked.createCmsClient({ baseUrl: "http://127.0.0.1:1" }), {
      find: checked.apiArticleArticleFind,
    })
    .find();
  expect(network.error.kind).toBe("network");
  expect(network.error.url).toBe("http://127.0.0.1:1/articles");
});

test("a non-JSON body that claims to be JSON is a JsonParseError", async () => {
  const broken = async () =>
    new Response("{not json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const result = await bind(checked, { fetch: broken }).find();
  expect(result.error.kind).toBe("json-parse");
  expect(result.error.status).toBe(200);
});
