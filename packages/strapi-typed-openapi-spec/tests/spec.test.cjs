const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} = require("node:fs/promises");
const { createRequire } = require("node:module");
const { dirname, join, resolve } = require("node:path");
const { after, before, test } = require("node:test");
const { promisify } = require("node:util");
const { assemble } = require("../dist/server/src/spec/assemble.js");
const { bootTestApp } = require("../dist/server/src/testing/index.js");

const appDir = join(__dirname, "fixture-app");
const fixtureRequire = createRequire(join(appDir, "package.json"));
const { generate } = fixtureRequire("@strapi/openapi");
const cli = join(__dirname, "..", "bin", "openapi-contract.js");
const run = promisify(execFile);

let app;
let document;
let coverage;
let output;

before(async () => {
  const tmp = join(appDir, ".tmp");
  await mkdir(tmp, { recursive: true });
  output = await mkdtemp(join(tmp, "spec-"));
  const database = process.env.DATABASE_FILENAME;
  process.env.DATABASE_FILENAME = join(output, "app.sqlite");
  try {
    app = await bootTestApp({ appDir });
  } finally {
    if (database === undefined) delete process.env.DATABASE_FILENAME;
    else process.env.DATABASE_FILENAME = database;
  }
  ({ document, coverage } = await assemble(app.strapi));
});

after(async () => {
  try {
    await app?.destroy();
  } finally {
    if (output) await rm(output, { recursive: true, force: true });
  }
});

async function node(script, args) {
  try {
    return await run(process.execPath, [script, ...args], {
      cwd: appDir,
      env: {
        ...process.env,
        DATABASE_FILENAME: join(output, "cli.sqlite"),
        STRAPI_TELEMETRY_DISABLED: "true",
        REDOCLY_TELEMETRY: "off",
      },
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`${error.message}\n${error.stdout}\n${error.stderr}`, {
      cause: error,
    });
  }
}

function packageBin(pkg, bin) {
  const path = fixtureRequire.resolve(`${pkg}/package.json`);
  return resolve(dirname(path), fixtureRequire(path).bin[bin]);
}

const readJson = async (filename) =>
  JSON.parse(await readFile(filename, "utf8"));
const wireValue = (value) => JSON.parse(JSON.stringify(value));
const httpMethods = new Set([
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "head",
  "options",
  "trace",
]);

function operationKeys(paths, rewrite = (path) => path) {
  return Object.entries(paths)
    .flatMap(([path, item]) =>
      Object.keys(item)
        .filter((method) => httpMethods.has(method))
        .map((method) => `${method.toUpperCase()} ${rewrite(path)}`),
    )
    .sort();
}

test("the fixture specification matches its snapshot", async () => {
  assert.deepEqual(
    wireValue(document),
    await readJson(join(appDir, "openapi.snapshot.json")),
  );
});

test("the generated operations match Strapi’s own content-API inventory", () => {
  const stock = generate(app.strapi, { type: "content-api" }).document;
  const stockRewrites = new Map([
    ["/connect/(.*)", "/connect/{wildcard}"],
    ["/contract/number/{id(\\d+)}", "/contract/number/{id}"],
    ["/users-permissions/roles/{id}", "/users-permissions/roles/{role}"],
  ]);
  assert.deepEqual(
    operationKeys(document.paths),
    operationKeys(stock.paths, (path) => stockRewrites.get(path) ?? path),
  );
});

test("operations describe real statuses, path regexes, media, security and the REST prefix", () => {
  assert.match(document.openapi, /^3\.1\.\d+$/);
  assert.deepEqual(document.servers, [
    { url: "http://127.0.0.1:1337/content" },
  ]);
  assert.equal(document.components.securitySchemes.bearerAuth.scheme, "bearer");

  const { paths } = document;
  const create = paths["/articles"].post;
  assert.equal(create.requestBody.required, true);
  assert(create.requestBody.content["application/json"].schema);
  assert(create.responses[201].content["application/json"].schema);
  assert.equal(create.responses[200], undefined);
  assert.deepEqual(create.responses[400].content["application/json"].schema, {
    $ref: "#/components/schemas/StrapiError400",
  });
  assert.deepEqual(
    document.components.schemas.StrapiError400.properties.error.properties
      .status,
    { type: "number", const: 400 },
  );
  assert.deepEqual(create.security, [{ bearerAuth: [] }, {}]);

  const statuses = (operation) =>
    Object.keys(operation.responses)
      .map(Number)
      .filter((status) => status >= 400);
  assert.deepEqual(statuses(paths["/articles"].get), [400, 401, 403, 500]);
  assert.deepEqual(
    statuses(paths["/articles/{id}"].get),
    [400, 401, 403, 404, 500],
  );
  assert.deepEqual(statuses(create), [400, 401, 403, 413, 500]);
  assert.deepEqual(
    statuses(paths["/articles/{id}"].put),
    [400, 401, 403, 404, 413, 500],
  );
  assert.deepEqual(
    statuses(paths["/articles/{id}"].delete),
    [400, 401, 403, 500],
  );
  assert.deepEqual(
    statuses(paths["/landing-page"].get),
    [400, 401, 403, 404, 500],
  );
  assert.deepEqual(
    statuses(paths["/landing-page"].put),
    [400, 401, 403, 413, 500],
  );
  assert.deepEqual(
    statuses(paths["/landing-page"].delete),
    [400, 401, 403, 500],
  );

  assert.deepEqual(statuses(paths["/topics"].get), [400, 401, 403, 404, 500]);
  const customized = coverage.routes.filter((route) => route.customized);
  assert.deepEqual(
    customized.map(({ method, path, customized }) => [
      method,
      path,
      customized,
    ]),
    [["GET", "/topics", ["controller"]]],
  );
  assert.equal(coverage.notices.length, 1);
  assert.match(
    coverage.notices[0],
    /^GET \/topics uses the core find response/,
  );

  const { schemas } = document.components;
  // Articles and link cards have media in the fixture, so the entry is one of the two models.
  const [present] = schemas.StrapiFile.properties.related.anyOf;
  assert.deepEqual(present.anyOf[0], {
    type: "array",
    items: {
      oneOf: [
        { $ref: "#/components/schemas/ArticleMorphEntry" },
        { $ref: "#/components/schemas/LinkCardMorphEntry" },
      ],
    },
  });
  const articleEntry = schemas.ArticleMorphEntry;
  assert.deepEqual(articleEntry.properties.__type, {
    type: "string",
    const: "api::article.article",
  });
  assert.deepEqual([...articleEntry.required].sort(), ["__type", "id"]);
  assert.equal(articleEntry.additionalProperties, false);
  const articleId = paths["/articles/{id}"].get.parameters.find(
    (parameter) => parameter.in === "path",
  );
  assert.equal(articleId.schema.format, undefined);
  assert.equal(articleId.schema.minLength, 1);
  assert.equal(
    paths["/articles/{id}"].delete.responses[204].content,
    undefined,
  );
  assert.equal(paths["/landing-page"].delete.responses[204].content, undefined);
  assert.equal(
    paths["/connect/{wildcard}"].get.responses[302].content,
    undefined,
  );
  assert(
    paths["/upload"].post.requestBody.content["multipart/form-data"].schema,
  );
  assert(
    paths["/upload"].post.responses[201].content["application/json"].schema,
  );
  assert(
    paths["/users"].post.responses[201].content["application/json"].schema,
  );
  const roles = paths["/users-permissions/roles/{role}"];
  assert.equal(
    roles.get.parameters.find((parameter) => parameter.in === "path").name,
    "role",
  );
  assert.equal(
    roles.delete.parameters.find((parameter) => parameter.in === "path").name,
    "role",
  );

  const publicOperation = paths["/contract/number/{id}"].get;
  assert.deepEqual(publicOperation.security, []);
  const id = publicOperation.parameters.find(
    (parameter) => parameter.in === "path" && parameter.name === "id",
  );
  assert.equal(id.required, true);
  assert.equal(id.schema.type, "string");
  assert.equal(id.schema.pattern, "^(?:\\d+)$");
  const wildcard = paths["/connect/{wildcard}"].get.parameters.find(
    (parameter) => parameter.in === "path",
  );
  assert.equal(wildcard.name, "wildcard");
  assert.equal(wildcard.required, true);
});

// Validates `value` against a schema inside the generated document.
function documentValidator(schema) {
  const Ajv2020 = require("ajv/dist/2020").default;
  const addFormats = require("ajv-formats").default;
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  ajv.addSchema({ ...document, $id: "doc" });
  const local = JSON.parse(
    JSON.stringify(schema).replaceAll('"#/components/', '"doc#/components/'),
  );
  return ajv.compile(local);
}

test("draft-and-publish writes name the body schema for each status", () => {
  const { paths } = document;
  for (const operation of [
    paths["/articles"].post,
    paths["/articles/{id}"].put,
  ]) {
    const mapping = operation["x-strapi-request-status"];
    assert.equal(mapping.parameter, "status");
    assert.equal(mapping.default, "published");
    assert(mapping.schemas.published && mapping.schemas.draft);
  }
  assert.equal(paths["/topics"].post["x-strapi-request-status"], undefined);
  assert.equal(
    paths["/landing-page"].put["x-strapi-request-status"],
    undefined,
  );

  const { published, draft } =
    paths["/articles"].post["x-strapi-request-status"].schemas;
  const missingTitle = { data: { description: "No title yet" } };
  assert.equal(documentValidator(published)(missingTitle), false);
  assert.equal(documentValidator(draft)(missingTitle), true);
  // The operation's own body stays the union, so it accepts both.
  assert.equal(
    documentValidator(
      paths["/articles"].post.requestBody.content["application/json"].schema,
    )(missingTitle),
    true,
  );
});

test("draft-and-publish reads name the response schema for each status", () => {
  const { paths } = document;
  for (const operation of [
    paths["/articles"].get,
    paths["/articles/{id}"].get,
  ]) {
    const mapping = operation["x-strapi-response-status"];
    assert.equal(mapping.status, 200);
    assert.equal(mapping.default, "published");
    const body = (entry) => ({
      data: operation === paths["/articles"].get ? [entry] : entry,
      meta:
        operation === paths["/articles"].get
          ? { pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 } }
          : {},
    });
    const entry = {
      id: 1,
      documentId: "abcdefghijklmnopqrstuvwx",
      title: null,
    };
    assert.equal(
      documentValidator(mapping.schemas.published)(
        body({ ...entry, publishedAt: "2026-01-01T00:00:00.000Z" }),
      ),
      false,
    );
    assert.equal(
      documentValidator(mapping.schemas.draft)(
        body({ ...entry, publishedAt: null }),
      ),
      true,
    );
  }
  assert.equal(paths["/topics"].get["x-strapi-response-status"], undefined);
  assert.equal(
    paths["/landing-page"].get["x-strapi-response-status"],
    undefined,
  );
});

test("draft-and-publish writes name the response schema for each status", async () => {
  const { paths } = document;
  const create = paths["/articles"].post["x-strapi-response-status"];
  const update = paths["/articles/{id}"].put["x-strapi-response-status"];
  assert.equal(create.status, 201);
  assert.equal(update.status, 200);
  for (const mapping of [create, update]) {
    assert.equal(mapping.parameter, "status");
    assert.equal(mapping.default, "published");
  }
  assert.equal(paths["/topics"].post["x-strapi-response-status"], undefined);
  assert.equal(
    paths["/landing-page"].put["x-strapi-response-status"],
    undefined,
  );

  // Strapi's core service defaults a write to `published`, so a write without
  // `status` returns the published entry.
  const { jwt } = (
    await app.request
      .post("/content/auth/local/register")
      .send({
        username: "status-writer",
        email: "status-writer@example.test",
        password: "fixture-password-only!",
      })
      .expect(200)
  ).body;
  const write = (method, path) =>
    app.request[method](`/content${path}`).set(
      "Authorization",
      `Bearer ${jwt}`,
    );
  const validate = (schema, body) => {
    const check = documentValidator(schema);
    assert(check(body), JSON.stringify(check.errors));
  };
  const published = await write("post", "/articles")
    .send({ data: { title: "Published by default" } })
    .expect(201);
  assert.notEqual(published.body.data.publishedAt, null);
  validate(create.schemas.published, published.body);
  const draft = await write("post", "/articles?status=draft")
    .send({ data: { title: "Draft write" } })
    .expect(201);
  assert.equal(draft.body.data.publishedAt, null);
  validate(create.schemas.draft, draft.body);
  assert.equal(documentValidator(create.schemas.published)(draft.body), false);
  const updated = await write(
    "put",
    `/articles/${draft.body.data.documentId}?status=published`,
  )
    .send({ data: { quantity: 2 } })
    .expect(200);
  assert.notEqual(updated.body.data.publishedAt, null);
  validate(update.schemas.published, updated.body);
});

test("a single type's PUT names its create and update bodies", () => {
  const operation = document.paths["/landing-page"].put;
  const write = operation["x-strapi-single-type-write"];
  assert.equal(write.condition, "document exists");
  assert.equal(write.statusParameter, undefined);
  const partial = { data: { introduction: { quotation: "Partial" } } };
  const complete = { data: { headline: "Hello", ...partial.data } };
  assert.equal(documentValidator(write.create)(partial), false);
  assert.equal(documentValidator(write.create)(complete), true);
  assert.equal(documentValidator(write.update)(partial), true);
  // The standard body stays broad enough for an existing document.
  const content = operation.requestBody.content["application/json"];
  assert.equal(documentValidator(content.schema)(partial), true);
  assert.match(operation.requestBody.description, /none exists/);
  assert.equal(
    documentValidator(write.create)(content.examples.create.value),
    true,
  );
  assert.equal(
    documentValidator(write.update)(content.examples.update.value),
    true,
  );
  assert.equal(
    document.paths["/topics/{id}"].put["x-strapi-single-type-write"],
    undefined,
  );
});

test("a relation offers a count only where its database storage can send one", () => {
  const { schemas } = document.components;
  const named = (schema) => schemas[schema.$ref.split("/").pop()];
  const response = named(
    document.paths["/articles/{id}"].get["x-strapi-response-status"].schemas
      .published,
  );
  const property = (name) =>
    JSON.stringify(named(response.properties.data).properties[name]);
  assert.match(property("topic"), /StrapiCount/);
  assert.doesNotMatch(property("leadTopic"), /StrapiCount/);
  const populate = document.paths["/articles/{id}"].get.parameters.find(
    (parameter) => parameter.name === "populate",
  );
  assert.match(populate.schema.description, /api::article\.article\.leadTopic/);
  assert.match(populate.schema.description, /permission/);
  const count = documentValidator({ $ref: "#/components/schemas/StrapiCount" });
  assert.equal(count({ count: 2 }), true);
  assert.equal(count({ count: -1 }), false);
  assert.equal(count({ count: 1.5 }), false);
});

test("numeric inputs stay numbers and describe Strapi's string coercion", () => {
  const input = document.components.schemas.ArticleInput.properties.quantity;
  const json = JSON.stringify(input);
  assert.match(json, /"type":"integer"/);
  assert.match(json, /"maximum":100/);
  assert.doesNotMatch(json, /"type":"string"/);
  assert.match(json, /x-strapi-coerces-numeric-string/);
  assert.match(json, /numeric string/);
});

test("a dynamic zone never has a count branch because Strapi ignores count there", async () => {
  const sections = (schema) =>
    JSON.stringify(
      document.components.schemas[schema.$ref.split("/").pop()].properties
        .sections,
    );
  const mapping =
    document.paths["/articles/{id}"].get["x-strapi-response-status"];
  for (const state of ["published", "draft"]) {
    const response =
      document.components.schemas[mapping.schemas[state].$ref.split("/").pop()];
    const data = response.properties.data;
    assert.doesNotMatch(sections(data), /StrapiCount/);
  }
  const { jwt } = (
    await app.request
      .post("/content/auth/local/register")
      .send({
        username: "zone-reader",
        email: "zone-reader@example.test",
        password: "fixture-password-only!",
      })
      .expect(200)
  ).body;
  const created = await app.request
    .post("/content/articles")
    .set("Authorization", `Bearer ${jwt}`)
    .send({
      data: {
        title: "Zone count",
        sections: [{ __component: "content.note", message: "Entry" }],
      },
    })
    .expect(201);
  const read = await app.request
    .get(
      `/content/articles/${created.body.data.documentId}?populate[sections][count]=true`,
    )
    .expect(200);
  assert(Array.isArray(read.body.data.sections));
  assert.equal(read.body.data.sections.length, 1);
});

test("generation reports all invalid config fields and preserves the validation error", () => {
  assert.throws(
    () =>
      assemble(app.strapi, {
        validationMode: "invalid",
        servers: [{ url: " " }],
        info: { extra: true },
      }),
    (error) => {
      assert.match(
        error.message,
        /Cannot generate OpenAPI contract: Invalid openapi-contract config/,
      );
      assert.match(error.message, /→ at validationMode/);
      assert.match(error.message, /→ at servers\[0\]\.url/);
      assert.match(error.message, /Unrecognized key: "extra"\n\s*→ at info/);
      assert.match(error.cause.stack, /resolveConfig/);
      assert.equal(error.cause.cause.issues.length, 3);
      return true;
    },
  );
});

test("generation reports invalid routes together and retains their original stacks", () => {
  const routes = app.strapi.apis.article.routes.contract.routes;
  const count = routes.length;
  routes.push(
    {
      method: "GET",
      path: "/contract/malformed/:id(",
      handler: "article.number",
    },
    {
      method: "GET",
      path: "/contract/optional/:id?",
      handler: "article.number",
    },
    {
      method: "GET",
      path: "/contract/\\{literal\\}",
      handler: "article.number",
    },
  );
  try {
    assert.throws(
      () => assemble(app.strapi),
      (error) => {
        assert.match(
          error.message,
          /GET \/contract\/malformed\/:id\(: api::article: Invalid route syntax: Unbalanced pattern/,
        );
        assert.match(
          error.message,
          /GET \/contract\/optional\/:id\?: api::article: Optional or repeated path parameter id/,
        );
        assert.ok(
          error.message.includes(
            "GET /contract/\\{literal\\}: api::article: Literal braces",
          ),
        );
        assert.match(error.errors[0].cause.cause.stack, /path-to-regexp/);
        assert.match(error.errors[1].cause.stack, /normalizePath/);
        return true;
      },
    );
  } finally {
    routes.length = count;
  }
});

test("the CLI emits the same spec and coverage; check detects a stale file", async () => {
  const spec = join(output, "cli.openapi.json");
  const report = join(output, "coverage.json");
  await node(cli, [
    "generate",
    "--app",
    appDir,
    "--out",
    spec,
    "--coverage",
    report,
  ]);
  assert.deepEqual(await readJson(spec), wireValue(document));
  assert.deepEqual(await readJson(report), wireValue(coverage));
  await node(cli, ["check", "--app", appDir, "--against", spec]);
  const stale = { ...document, info: { ...document.info, title: "Old title" } };
  await writeFile(spec, JSON.stringify(stale));
  await assert.rejects(
    node(cli, ["check", "--app", appDir, "--against", spec]),
    (error) => error.cause?.code === 1,
  );
});

test("Redocly lints the artifact and a generated typed client calls the live fixture", async () => {
  const spec = join(output, "openapi.json");
  await writeFile(spec, JSON.stringify(document));
  await node(packageBin("@redocly/cli", "redocly"), [
    "lint",
    spec,
    "--config",
    join(appDir, "redocly.yaml"),
  ]);
  await node(packageBin("openapi-typescript", "openapi-typescript"), [
    spec,
    "--default-non-nullable",
    "false",
    "--output",
    join(output, "paths.d.ts"),
  ]);
  const heyOutput = join(output, "hey-api");
  await node(packageBin("@hey-api/openapi-ts", "openapi-ts"), [
    "--input",
    spec,
    "--output",
    heyOutput,
  ]);
  await access(join(heyOutput, "types.gen.ts"));

  const client = join(output, "client.ts");
  const compiled = join(output, "compiled");
  await copyFile(join(appDir, "client.ts"), client);
  await node(packageBin("typescript", "tsc"), [
    // TypeScript 6 refuses command-line files when it finds a tsconfig.json
    // above the working directory (the package tsconfig); compile in isolation.
    "--ignoreConfig",
    "--strict",
    "--skipLibCheck",
    "--module",
    "Node16",
    "--target",
    "ES2022",
    "--outDir",
    compiled,
    client,
  ]);
  const { fetchContractNumber } = require(join(compiled, "client.js"));
  const { port } = app.strapi.server.httpServer.address();
  assert.equal(
    await fetchContractNumber(`http://127.0.0.1:${port}/content`, "42"),
    42,
  );
});
