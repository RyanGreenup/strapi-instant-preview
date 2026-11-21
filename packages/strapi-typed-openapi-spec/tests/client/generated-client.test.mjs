import { execFile } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, test } from "vitest";

// Generates a client from the fixture app's contract and calls the live app
// with it. Run with `--pool=threads`: booting Strapi in a forked worker
// breaks vitest's IPC channel.

const require = createRequire(import.meta.url);
const { bootTestApp } = require("../../dist/server/src/testing/index.js");
const {
  checkClient,
  generateClient,
} = require("../../dist/server/src/tooling/index.js");

const appDir = join(import.meta.dirname, "../fixture-app");
// Inside the package, so the client resolves TypeBox from its node_modules.
const output = join(import.meta.dirname, "../.tmp/generated-client-test");
const password = "fixture-password-only!";

let app;
let databaseDir;
let baseUrl;
let token;
let spec;
let checked;
let unchecked;
let raw;
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
  const response = await app.request
    .get("/content/openapi-contract/spec.json")
    .set("authorization", `Bearer ${token}`)
    .expect(200);
  spec = response.body;

  await rm(output, { recursive: true, force: true });
  warnings = await generateClient(spec, output);
  checked = await import(join(output, "index.ts"));
  unchecked = await import(join(output, "unchecked.ts"));
  raw = await import(join(output, "generated/cms.ts"));
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

test("an option set to undefined keeps the client's own", async () => {
  // A spread `fetch: undefined` would drop the base URL and token.
  const result = await bind(checked).find(undefined, { fetch: undefined });
  expect(result.ok).toBe(true);
});

test("each operation carries its method, path and options position", () => {
  const key = Symbol.for("cms-client.operation");
  const described = Object.entries(unchecked).filter(
    ([, value]) => typeof value === "function" && key in value,
  );
  expect(described.length).toBeGreaterThan(0);
  for (const [name, operation] of described) {
    const info = operation[key];
    // The position comes from the contract. Orval emits no defaults, so
    // `length` agrees; a mismatch means orval changed its parameter order.
    expect(info.optionsIndex, name).toBe(raw[name].length - 1);
    expect(info.method, name).toMatch(/^[A-Z]+$/u);
    expect(info.path, name).toMatch(/^\//u);
    // The validated copy keeps the same information.
    if (name in checked) expect(checked[name][key], name).toEqual(info);
  }
});

test("path parameters are encoded into one segment", async () => {
  const result = await bind(checked).findOne("a/b?c");
  expect(result.error.kind).toBe("http");
  expect(result.error.status).toBe(404);
  expect(result.error.url).toBe(`${baseUrl}/articles/a%2Fb%3Fc`);
});

test.each(["", ".", ".."])(
  "the ID %j is refused before any request",
  async (id) => {
    let calls = 0;
    const count = async (input, init) => {
      calls += 1;
      return fetch(input, init);
    };
    const result = await bind(checked, { fetch: count }).findOne(id);
    expect(result.error.kind).toBe("invalid-request");
    expect(calls).toBe(0);
  },
);

test("the client's fetch rejects a bad path instead of throwing", async () => {
  const client = checked.createCmsClient({ baseUrl });
  for (const path of ["articles", "/articles/..", "/articles//x"]) {
    const pending = client.fetch(path);
    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).rejects.toBeInstanceOf(checked.InvalidRequestError);
  }
});

test("an error before sending names the operation", async () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const client = checked.createCmsClient({ baseUrl, token });
  const bound = checked.bindClient(client, {
    find: checked.apiArticleArticleFind,
    update: checked.apiArticleArticleUpdate,
  });

  const find = await bound.find({ filters: cyclic });
  expect(find.error.kind).toBe("invalid-request");
  expect(find.error.method).toBe("GET");
  expect(find.error.url).toBe(`${baseUrl}/articles`);

  const update = await bound.update("x", { data: {} }, { filters: cyclic });
  expect(update.error.kind).toBe("invalid-request");
  expect(update.error.method).toBe("PUT");
  expect(update.error.url).toBe(`${baseUrl}/articles/{id}`);
});

test("populated mode rejects a relation count", async () => {
  const withCount = async (input, init) => {
    const body = await (await fetch(input, init)).json();
    const article = { id: 1, documentId: "a00000000000000000000001" };
    return Response.json({
      ...body,
      data: [{ ...article, topic: { count: 2 } }],
    });
  };
  const client = checked.createCmsClient({ baseUrl, token, fetch: withCount });
  const operations = { find: checked.apiArticleArticleFind };

  const counted = await checked.bindClient(client, operations).find();
  expect(counted.ok).toBe(true);

  const populated = await checked
    .bindClient(client, operations, { populated: true })
    .find();
  expect(populated.error.kind).toBe("validation");
  expect(populated.error.issues[0].path).toEqual(["data", 0, "topic"]);
});

test("checkClient names the files that differ from a fresh generation", async () => {
  const copy = await mkdtemp(join(tmpdir(), "openapi-contract-check-"));
  try {
    await cp(output, copy, { recursive: true });
    await expect(checkClient(spec, copy)).resolves.toEqual([]);

    await writeFile(join(copy, "client.ts"), "// edited\n");
    await rm(join(copy, "generated/schemas.ts"));
    await writeFile(join(copy, "extra.ts"), "");
    await expect(checkClient(spec, copy)).resolves.toEqual([
      "client.ts",
      "extra.ts",
      "generated/schemas.ts",
    ]);
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
}, 60_000);

test("the generated client and its types compile", async () => {
  const tsgo = join(import.meta.dirname, "../../node_modules/.bin/tsgo");
  const project = join(import.meta.dirname, "tsconfig.generated.json");
  let outcome = "";
  try {
    await promisify(execFile)(tsgo, ["-p", project]);
  } catch (error) {
    outcome = `${error.stdout}${error.stderr}`;
  }
  expect(outcome).toBe("");
}, 120_000);
