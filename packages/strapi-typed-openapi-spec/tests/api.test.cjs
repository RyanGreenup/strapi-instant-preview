const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { crc32, deflateSync } = require("node:zlib");
const { after, afterEach, before, test } = require("node:test");
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats").default;
const {
  bootTestApp,
  contractViolations,
  expectNoContractViolations,
  resetContractViolations,
} = require("../dist/server/src/testing/index.js");

const appDir = join(__dirname, "fixture-app");
const prefix = "/content";
const password = "fixture-password-only!";
let app;
let jwt;
let databaseDir;

before(async () => {
  const previous = process.env.FIXTURE_EXPOSE_SPEC;
  const database = process.env.DATABASE_FILENAME;
  if ((process.env.DATABASE_CLIENT ?? "sqlite") === "sqlite") {
    databaseDir = await mkdtemp(join(tmpdir(), "openapi-contract-api-"));
    process.env.DATABASE_FILENAME = join(databaseDir, "app.sqlite");
  }
  process.env.FIXTURE_EXPOSE_SPEC = "true";
  try {
    app = await bootTestApp({ appDir });
  } finally {
    if (previous === undefined) delete process.env.FIXTURE_EXPOSE_SPEC;
    else process.env.FIXTURE_EXPOSE_SPEC = previous;
    if (database === undefined) delete process.env.DATABASE_FILENAME;
    else process.env.DATABASE_FILENAME = database;
  }
  const registration = await app.request
    .post(`${prefix}/auth/local/register`)
    .send({
      username: "contract-editor",
      email: "editor@example.test",
      password,
    })
    .expect(200);
  jwt = registration.body.jwt;
  assert.equal(typeof jwt, "string");
});

afterEach(() => {
  if (app) expectNoContractViolations(app.strapi);
});

after(async () => {
  try {
    await app?.destroy();
  } finally {
    if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
  }
});

const editor = (method, path) =>
  app.request[method](`${prefix}${path}`).set("Authorization", `Bearer ${jwt}`);
const anonymous = (path) => app.request.get(`${prefix}${path}`);
const missingId = "z5nqbefpcrlcbstvqopnkxeo";

async function createTopic(name, parent) {
  const { body } = await editor("post", "/topics")
    .send({ data: { name, parent } })
    .expect(201);
  assert.equal(body.data.name, name);
  return body.data;
}

function assertError(response, status) {
  assert.equal(response.body.data, null);
  assert.equal(response.body.error.status, status);
  assert.equal(typeof response.body.error.message, "string");
}

// A solid-color RGB PNG, big enough for the upload plugin to generate formats.
function solidPng(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x60)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk(
      "IDAT",
      deflateSync(Buffer.concat(Array.from({ length: height }, () => row))),
    ),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("the optional spec endpoint caches the contract and requires bearer credentials", async () => {
  const route = "/openapi-contract/spec.json";
  assertError(await anonymous(route).expect(401), 401);
  const response = await editor("get", route).expect(200);
  assert.equal(response.body.openapi, "3.1.0");
  assert.deepEqual(response.body.paths[route].get.security, [
    { bearerAuth: [] },
  ]);
  assert.deepEqual(
    (await editor("get", route).expect(200)).body,
    response.body,
  );
});

test("collection CRUD returns the documented envelopes, pagination, and empty delete", async () => {
  const topic = await createTopic("Topic lifecycle");
  const path = `/topics/${topic.documentId}`;

  const found = await anonymous(path).expect(200);
  assert.deepEqual(found.body.meta, {});
  assert.equal(found.body.data.id, topic.id);
  assert.equal(found.body.data.documentId, topic.documentId);

  const updated = await editor("put", path)
    .send({ data: { name: "Updated topic" } })
    .expect(200);
  assert.equal(updated.body.data.name, "Updated topic");
  assert.equal(updated.body.data.documentId, topic.documentId);

  const page = await anonymous(
    "/topics?pagination[page]=1&pagination[pageSize]=1",
  ).expect(200);
  assert.equal(page.body.meta.pagination.pageSize, 1);
  assert.equal(page.body.data.length, 1);
  const offset = await anonymous(
    "/topics?pagination[start]=0&pagination[limit]=2",
  ).expect(200);
  assert.equal(offset.body.meta.pagination.start, 0);
  assert.equal(offset.body.meta.pagination.limit, 2);

  const deleted = await editor("delete", path).expect(204);
  assert.equal(deleted.text, "");
  assertError(await anonymous(path).expect(404), 404);
});

test("draft and locale responses preserve blocks, dynamic zones, scalar wire types, and optional fields", async () => {
  const block = {
    type: "paragraph",
    children: [{ type: "text", text: "Hello", bold: true }],
  };
  const data = {
    title: "Article français",
    description: "Résumé",
    legacyRichText: "**Markdown**",
    contact: "author@example.test",
    slug: "article-francais",
    quantity: 2,
    rating: 4.5,
    price: 12.25,
    hugeNumber: "1234567890",
    dueDate: "2030-02-03",
    scheduledAt: "2030-02-03T14:15:16.000Z",
    startsAt: "14:15:16.789",
    eventEpoch: "1896358516000",
    settings: { enabled: true },
    secret: password,
    color: "#663399",
    body: [block],
    notes: [{ message: "Private note", passphrase: password }],
    sections: [
      { __component: "content.note", message: "Public note" },
      { __component: "content.quote", quotation: "Bonjour", attribution: null },
    ],
  };
  const created = await editor("post", "/articles?status=draft&locale=fr")
    .send({ data })
    .expect(201);
  const documentId = created.body.data.documentId;
  const path = `/articles/${documentId}`;
  assert.match(documentId, /^[a-z][a-z0-9]{23}$/);
  assert.equal(created.body.data.publishedAt, null);
  assert.equal(created.body.data.locale, "fr");
  assert.equal(created.body.data.category, "news");
  assert.equal(created.body.data.featured, false);
  assert.equal(Object.hasOwn(created.body.data, "secret"), false);

  const populated = await anonymous(
    `${path}?status=draft&locale=fr&populate=*`,
  ).expect(200);
  assert.deepEqual(populated.body.data.body, [block]);
  assert.equal(populated.body.data.hugeNumber, data.hugeNumber);
  assert.equal(populated.body.data.eventEpoch, data.eventEpoch);
  assert.equal(populated.body.data.price, data.price);
  assert.equal(populated.body.data.startsAt, data.startsAt);
  assert.equal(populated.body.data.color, data.color);
  assert.equal(populated.body.data.notes[0].message, "Private note");
  assert.equal(
    Object.hasOwn(populated.body.data.notes[0], "passphrase"),
    false,
  );
  assert.deepEqual(
    populated.body.data.sections.map(({ __component }) => __component),
    ["content.note", "content.quote"],
  );
  assert.equal(populated.body.data.sections[1].attribution, null);

  const selected = await anonymous(
    `${path}?status=draft&locale=fr&fields[0]=title`,
  ).expect(200);
  assert.equal(selected.body.data.title, data.title);
  assert.equal(typeof selected.body.data.id, "number");
  assert.equal(selected.body.data.documentId, documentId);
  assert.equal(Object.hasOwn(selected.body.data, "body"), false);
  assert.equal(Object.hasOwn(selected.body.data, "notes"), false);

  const drafts = await anonymous("/articles?status=draft&locale=fr").expect(
    200,
  );
  assert(drafts.body.data.some((entry) => entry.documentId === documentId));
  const published = await anonymous("/articles?locale=fr").expect(200);
  assert(!published.body.data.some((entry) => entry.documentId === documentId));
  const changed = await editor("put", `${path}?status=draft&locale=fr`)
    .send({ data: { title: "Brouillon révisé" } })
    .expect(200);
  assert.equal(changed.body.data.title, "Brouillon révisé");
  assert.equal(changed.body.data.locale, "fr");
  assert.equal(
    (await editor("delete", `${path}?locale=fr`).expect(204)).text,
    "",
  );
  assertError(
    await anonymous(`${path}?status=draft&locale=fr`).expect(404),
    404,
  );
});

test("nested relation population distinguishes documents, a self-relation, and a count", async () => {
  const parent = await createTopic("Parent");
  const child = await createTopic("Child", parent.documentId);
  const related = await editor("post", "/articles")
    .send({ data: { title: "Related article" } })
    .expect(201);
  const { body } = await editor("post", "/articles")
    .send({
      data: {
        title: "Relational article",
        topic: child.documentId,
        topics: { connect: [parent.documentId, child.documentId] },
        relatedArticles: [related.body.data.documentId],
      },
    })
    .expect(201);
  const path = `/articles/${body.data.documentId}`;

  const nested = await anonymous(
    `${path}?populate[topic][populate][parent]=true&populate[relatedArticles]=true`,
  ).expect(200);
  assert.equal(nested.body.data.topic.documentId, child.documentId);
  assert.equal(nested.body.data.topic.parent.name, "Parent");
  assert.equal(
    nested.body.data.relatedArticles[0].documentId,
    related.body.data.documentId,
  );
  const counted = await anonymous(
    `${path}?populate[topics][count]=true`,
  ).expect(200);
  assert.deepEqual(counted.body.data.topics, { count: 2 });
});

test("an empty single type returns 404, then supports create/update through PUT and empty DELETE", async () => {
  const path = "/landing-page";
  assertError(await anonymous(path).expect(404), 404);
  // PUT creates the missing document, so a partial body needs `headline`.
  const partial = { data: { introduction: { quotation: "Partial" } } };
  assertError(await editor("put", path).send(partial).expect(400), 400);
  assertError(await anonymous(path).expect(404), 404);
  const added = await editor("put", path)
    .send({
      data: {
        headline: "Hello!",
        introduction: { quotation: "Welcome" },
      },
    })
    .expect(200);
  const found = await anonymous(`${path}?populate=*`).expect(200);
  assert.equal(found.body.data.documentId, added.body.data.documentId);
  assert.equal(found.body.data.introduction.quotation, "Welcome");
  const updated = await editor("put", path)
    .send({ data: { headline: "Welcome back!" } })
    .expect(200);
  assert.equal(updated.body.data.headline, "Welcome back!");
  assert.equal(updated.body.data.documentId, added.body.data.documentId);
  // The same partial body that failed on create updates the existing document.
  const patched = await editor("put", `${path}?populate=*`)
    .send(partial)
    .expect(200);
  assert.equal(patched.body.data.headline, "Welcome back!");
  assert.equal(patched.body.data.introduction.quotation, "Partial");
  assert.equal((await editor("delete", path).expect(204)).text, "");
  assertError(await anonymous(path).expect(404), 404);
});

test("multipart upload is 201 and populates single, multiple, and reverse morph associations", async () => {
  const created = await editor("post", "/articles")
    .send({ data: { title: "Article with media" } })
    .expect(201);
  const { documentId } = created.body.data;
  const fileText = Buffer.from("A file for the OpenAPI contract fixture.\n");
  const files = [];
  try {
    for (const [field, filename] of [
      ["cover", "cover.txt"],
      ["attachments", "attachment.txt"],
    ]) {
      const uploaded = await editor("post", "/upload")
        .field("ref", "api::article.article")
        .field("refId", documentId)
        .field("field", field)
        .attach("files", fileText, { filename, contentType: "text/plain" })
        .expect(201);
      assert.equal(uploaded.body.length, 1);
      assert.equal(uploaded.body[0].name, filename);
      files.push(uploaded.body[0]);
    }

    const populated = await anonymous(
      `/articles/${documentId}?populate[cover]=true&populate[attachments]=true`,
    ).expect(200);
    assert.equal(populated.body.data.cover.id, files[0].id);
    assert.deepEqual(
      populated.body.data.attachments.map(({ id }) => id),
      [files[1].id],
    );

    const reverse = await anonymous(
      `/upload/files/${files[0].id}?populate[related][on][api::article.article][fields][0]=title`,
    ).expect(200);
    assert(
      reverse.body.related.some(
        (entry) =>
          entry.__type === "api::article.article" &&
          entry.title === "Article with media",
      ),
    );
    const full = await anonymous(
      `/upload/files/${files[0].id}?populate[related]=true`,
    ).expect(200);
    assert(
      full.body.related.some(
        (entry) =>
          entry.__type === "api::article.article" &&
          entry.documentId === documentId,
      ),
    );
  } finally {
    for (const { id } of files)
      await editor("delete", `/upload/files/${id}`).expect(200);
  }
});

test("an image upload returns typed formats and focal point", async () => {
  const uploaded = await editor("post", "/upload")
    .field("fileInfo", JSON.stringify({ focalPoint: { x: 25, y: 75 } }))
    .attach("files", solidPng(640, 480), {
      filename: "cover.png",
      contentType: "image/png",
    })
    .expect(201);
  const [file] = uploaded.body;
  try {
    assert.deepEqual(file.focalPoint, { x: 25, y: 75 });
    assert.equal(typeof file.formats.thumbnail.url, "string");
    assert.equal(file.formats.small.width, 500);
    const found = await anonymous(`/upload/files/${file.id}`).expect(200);
    assert.deepEqual(found.body.formats, file.formats);
    assert.deepEqual(found.body.focalPoint, file.focalPoint);
  } finally {
    await editor("delete", `/upload/files/${file.id}`).expect(200);
  }
});

test("custom schemas and default error contracts apply to public and protected operations", async () => {
  const declared = await editor("get", "/contract/declared").expect(200);
  assert.deepEqual(declared.body, { ready: true });
  const publicRoute = await anonymous("/contract/number/42").expect(200);
  assert.deepEqual(publicRoute.body, { number: 42 });
  await anonymous("/contract/number/not-a-number").expect(404);
  const upstream = await anonymous("/contract/echo?text=from-upstream").expect(
    200,
  );
  assert.deepEqual(upstream.body, { text: "from-upstream" });

  assertError(await anonymous(`/articles/${missingId}`).expect(404), 404);
  assertError(
    await anonymous("/contract/declared")
      .set("Authorization", "Bearer not-a-token")
      .expect(401),
    401,
  );
  assertError(await anonymous("/contract/declared").expect(403), 403);
  assertError(await editor("post", "/articles").send({}).expect(400), 400);
});

test("numeric fields accept numeric strings, which Strapi casts to numbers", async () => {
  // Pins the behaviour behind server/src/schemas/numeric-strings.ts. If Strapi
  // stops casting, this fails and the extension can be removed.
  const { body } = await editor("post", "/articles")
    .send({
      data: {
        title: "Numeric strings",
        quantity: "12",
        rating: "1.5",
        price: "2.25",
      },
    })
    .expect(201);
  assert.equal(body.data.quantity, 12);
  assert.equal(body.data.rating, 1.5);
  assert.equal(body.data.price, 2.25);
  await editor("post", "/articles")
    .send({ data: { title: "Not a number", quantity: "twelve" } })
    .expect(400);
  // Strapi checks the range and integer rules on the cast number.
  for (const quantity of ["101", "12.5"])
    await editor("post", "/articles")
      .send({ data: { title: "Out of range", quantity } })
      .expect(400);
  await editor("post", "/articles?status=draft")
    .send({ data: { title: "Draft out of range", quantity: "101" } })
    .expect(400);
  const draft = await editor("post", "/articles?status=draft")
    .send({ data: { title: "Draft in range", quantity: "100" } })
    .expect(201);
  assert.equal(draft.body.data.quantity, 100);
});

test("spec mode checks a default core response against the schema for its status", async () => {
  const draft = (
    await editor("post", "/articles?status=draft")
      .send({ data: { title: "Status draft" } })
      .expect(201)
  ).body.data;
  const path = `/articles/${draft.documentId}`;
  await anonymous(`${path}?status=draft`).expect(200);
  await anonymous(`/articles?status=draft`).expect(200);

  const service = app.strapi.service("api::article.article");
  const { find, findOne } = service;
  const patch = (change) => {
    service.findOne = async function (...args) {
      const document = await findOne.apply(this, args);
      if (document) change(document);
      return document;
    };
  };
  const expectViolation = async (url) => {
    const response = await anonymous(url).expect(500);
    assert.equal(response.body.error.name, "ContractViolation");
    const [violation] = contractViolations(app.strapi);
    assert.equal(violation.kind, "schema-mismatch");
    resetContractViolations(app.strapi);
  };
  try {
    // The ordinary response is the published/draft union, which accepts both.
    patch((document) => {
      document.publishedAt = "2026-01-01T00:00:00.000Z";
    });
    await expectViolation(`${path}?status=draft`);
    patch((document) => {
      document.publishedAt = null;
    });
    const published = (
      await editor("post", "/articles")
        .send({ data: { title: "Status published" } })
        .expect(201)
    ).body.data;
    await expectViolation(`/articles/${published.documentId}`);
    await expectViolation(`/articles/${published.documentId}?status=published`);
    // An unsupported status value keeps the ordinary schema.
    await anonymous(`/articles/${published.documentId}?status=archived`).expect(
      (response) => assert.notEqual(response.status, 500),
    );
    resetContractViolations(app.strapi);

    // A populated draft-and-publish target follows the requested status too.
    const owner = (
      await editor("post", "/articles?status=draft")
        .send({
          data: {
            title: "Status owner",
            relatedArticles: [draft.documentId],
          },
        })
        .expect(201)
    ).body.data;
    service.findOne = findOne;
    await anonymous(
      `/articles/${owner.documentId}?status=draft&populate[relatedArticles]=true`,
    ).expect(200);
    patch((document) => {
      for (const related of document.relatedArticles ?? [])
        related.publishedAt = "2026-01-01T00:00:00.000Z";
    });
    await expectViolation(
      `/articles/${owner.documentId}?status=draft&populate[relatedArticles]=true`,
    );
    service.findOne = findOne;
    service.find = async function (...args) {
      const result = await find.apply(this, args);
      for (const document of result.results) document.publishedAt = null;
      return result;
    };
    await expectViolation("/articles");
  } finally {
    service.find = find;
    service.findOne = findOne;
    resetContractViolations(app.strapi);
  }
});

test("users-permissions registers, signs in, manages refresh sessions, creates users, and redirects", async () => {
  const newUser = {
    username: "session-fixture",
    email: "session@example.test",
    password,
  };
  const registered = await app.request
    .post(`${prefix}/auth/local/register`)
    .send(newUser)
    .expect(200);
  assert.equal(registered.body.user.username, newUser.username);
  assert.equal(typeof registered.body.refreshToken, "string");
  assert.equal(Object.hasOwn(registered.body.user, "password"), false);

  const loggedIn = await app.request
    .post(`${prefix}/auth/local`)
    .send({ identifier: newUser.email, password, deviceId: "login-device" })
    .expect(200);
  assert.equal(loggedIn.body.user.email, newUser.email);
  assert.equal(typeof loggedIn.body.refreshToken, "string");
  const bearer = (method, path, token = loggedIn.body.jwt) =>
    app.request[method](`${prefix}${path}`).set(
      "Authorization",
      `Bearer ${token}`,
    );

  const listed = await bearer("get", "/auth/sessions").expect(200);
  assert.equal(listed.body.data.length, 2);
  assert.equal(listed.body.data[0].current, true);
  const other = listed.body.data.find(({ current }) => !current);
  assert.equal(typeof other.deviceId, "string");
  assert.notEqual(other.deviceId, "login-device");
  const revoked = await bearer("delete", `/auth/sessions/${other.id}`).expect(
    200,
  );
  assert.deepEqual(revoked.body, { data: {} });

  const refreshed = await app.request
    .post(`${prefix}/auth/refresh`)
    .send({ refreshToken: loggedIn.body.refreshToken })
    .expect(200);
  assert.equal(typeof refreshed.body.jwt, "string");
  assert.notEqual(refreshed.body.refreshToken, loggedIn.body.refreshToken);
  const loggedOut = await bearer("post", "/auth/logout", refreshed.body.jwt)
    .send({ refreshToken: refreshed.body.refreshToken })
    .expect(200);
  assert.deepEqual(loggedOut.body, { ok: true });
  const invalidRefresh = await app.request
    .post(`${prefix}/auth/refresh`)
    .send({ refreshToken: refreshed.body.refreshToken })
    .expect(401);
  assertError(invalidRefresh, 401);

  const roles = await app.strapi
    .plugin("users-permissions")
    .service("role")
    .find();
  const { id: role } = roles.find(({ type }) => type === "authenticated");
  const created = await editor("post", "/users")
    .send({
      username: "created-by-editor",
      email: "managed@example.test",
      password,
      role,
    })
    .expect(201);
  assert.equal(created.body.email, "managed@example.test");
  assert.equal(Object.hasOwn(created.body, "password"), false);

  const redirect = await anonymous("/connect/github").redirects(0).expect(302);
  const location = new URL(redirect.headers.location);
  assert.equal(location.origin, "https://github.com");
  assert.equal(location.pathname, "/login/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), "fixture-client-id");
});

test("users-permissions and upload reject the inputs their contracts exclude", async () => {
  const user = {
    username: "strict-fixture",
    email: "strict@example.test",
    password,
  };
  assertError(
    await app.request
      .post(`${prefix}/auth/local/register`)
      .send({ ...user, deviceId: "register-device" })
      .expect(400),
    400,
  );
  const registered = await app.request
    .post(`${prefix}/auth/local/register`)
    .send(user)
    .expect(200);
  const bearer = (method, path) =>
    app.request[method](`${prefix}${path}`).set(
      "Authorization",
      `Bearer ${registered.body.jwt}`,
    );

  const change = {
    currentPassword: password,
    password: `${password}2`,
    passwordConfirmation: `${password}2`,
  };
  assertError(
    await bearer("post", "/auth/change-password")
      .send({ ...change, deviceId: "device" })
      .expect(400),
    400,
  );
  await bearer("post", "/auth/change-password").send(change).expect(200);

  await anonymous("/upload/files?fields=name,url").expect(200);
  assertError(
    await anonymous("/upload/files?fields[0]=name,url").expect(400),
    400,
  );
  await anonymous("/upload/files?filters[name][$eq]=x").expect(200);
  assertError(
    await anonymous("/upload/files?filters[unknown][$eq]=x").expect(400),
    400,
  );
  assertError(await anonymous("/upload/files?sort=unknown").expect(400), 400);
  // Each stable form of error.details, as the contract's StrapiErrorDetails names them.
  const invalidKey = await anonymous("/upload/files?sort=unknown").expect(400);
  assert.deepEqual(invalidKey.body.error.details, {
    key: "unknown",
    path: null,
    source: "query",
    param: "sort",
  });
  assert.deepEqual(
    (await anonymous("/upload/files?fields[0]=name,url").expect(400)).body.error
      .details,
    {},
  );
  const invalidBody = await editor("post", "/articles")
    .send({ data: { title: 5 } })
    .expect(400);
  assert.deepEqual(
    invalidBody.body.error.details.errors.map(({ path, name, value }) => ({
      path,
      name,
      value,
    })),
    [{ path: ["title"], name: "ValidationError", value: 5 }],
  );
});

test("spec mode catches a malformed response and skips explicitly excluded wire formats", async () => {
  const url = "/contract/echo?text=expected&breakContract=yes";
  for (const [header, value] of [
    ["Strapi-Response-Format", "v4"],
    ["Strapi-Encode-Source-Maps", "true"],
  ]) {
    const result = await anonymous(url).set(header, value).expect(200);
    assert.deepEqual(result.body, { text: 42 });
  }
  expectNoContractViolations(app.strapi);

  try {
    const invalid = await anonymous(url).expect(500);
    assert.equal(invalid.body.error.name, "ContractViolation");
    assert.equal(contractViolations(app.strapi).length, 1);
    const [violation] = contractViolations(app.strapi);
    assert.match(violation.route, /contract\/echo$/);
    assert.equal(violation.status, 200);
    assert.equal(violation.kind, "schema-mismatch");
    assert.throws(
      () => expectNoContractViolations(app.strapi),
      /Content API contract violations/,
    );
  } finally {
    resetContractViolations(app.strapi);
  }
});

// The spec must accept every body the server accepts, and reject the ones it rejects.
// Bodies come from the fixture's link-card model: conditional fields (Strapi skips
// every rule of a hidden field) and required relation and media (Strapi checks them
// only with api.documents.strictRelations, off in the fixture).
test("request bodies agree with the server on conditional fields and required relations", async () => {
  const spec = (await editor("get", "/openapi-contract/spec.json").expect(200))
    .body;
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  ajv.addSchema(spec, "spec");
  const bodySchema = (path, method) =>
    ajv.compile({
      $ref: `spec#/paths/${path.replace(/~/g, "~0").replace(/\//g, "~1")}/${method}/requestBody/content/application~1json/schema`,
    });
  const create = bodySchema("/link-cards", "post");
  const update = bodySchema("/link-cards/{id}", "put");
  const topic = await createTopic("Link target");

  const agree = async (method, path, validate, data, status) => {
    const response = await editor(method, path).send({ data });
    assert.equal(
      response.status,
      status,
      `${method} ${JSON.stringify(data)}: ${JSON.stringify(response.body)}`,
    );
    assert.equal(
      validate({ data }),
      status < 400,
      `spec and server disagree on ${JSON.stringify(data)}`,
    );
    return response.body.data;
  };

  // Hidden fields break their rules; the relation and media are left out
  const card = await agree(
    "post",
    "/link-cards",
    create,
    {
      label: "Hidden",
      kind: "topic",
      url: `ftp://${"x".repeat(100)}`,
      email: "not an email",
    },
    201,
  );
  await agree(
    "post",
    "/link-cards",
    create,
    { label: "Topic", topic: topic.documentId },
    201,
  );
  await agree(
    "post",
    "/link-cards",
    create,
    { label: "Site", kind: "external", url: "https://example.test" },
    201,
  );
  // Visible fields keep their rules
  await agree(
    "post",
    "/link-cards",
    create,
    { label: "Site", kind: "external", url: "ftp://example.test" },
    400,
  );
  await agree(
    "post",
    "/link-cards",
    create,
    { label: "Site", kind: "external" },
    400,
  );
  await agree(
    "post",
    "/link-cards",
    create,
    { label: "Mail", kind: "email", email: "not an email" },
    400,
  );
  await agree("post", "/link-cards", create, { label: "x".repeat(41) }, 400);
  await agree(
    "post",
    "/link-cards",
    create,
    { label: "Bad", kind: "other" },
    400,
  );

  // A round trip of the stored document is accepted
  const stored = (
    await editor("get", `/link-cards/${card.documentId}`).expect(200)
  ).body.data;
  const { id, documentId, createdAt, updatedAt, publishedAt, ...data } = stored;
  await agree("put", `/link-cards/${card.documentId}`, update, data, 200);
  await agree(
    "put",
    `/link-cards/${card.documentId}`,
    update,
    { ...data, notAField: 1 },
    400,
  );
});
