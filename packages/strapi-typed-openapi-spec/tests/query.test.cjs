// Query-aware response checks (validationMode 'query') against the live fixture.
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { after, afterEach, before, test } = require("node:test");
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
let article;
const files = [];

const editor = (method, path) =>
  app.request[method](`${prefix}${path}`).set("Authorization", `Bearer ${jwt}`);
const anonymous = (path) => app.request.get(`${prefix}${path}`);

before(async () => {
  const database = process.env.DATABASE_FILENAME;
  if ((process.env.DATABASE_CLIENT ?? "sqlite") === "sqlite") {
    databaseDir = await mkdtemp(join(tmpdir(), "openapi-contract-query-"));
    process.env.DATABASE_FILENAME = join(databaseDir, "app.sqlite");
  }
  try {
    app = await bootTestApp({ appDir, validationMode: "query" });
  } finally {
    if (database === undefined) delete process.env.DATABASE_FILENAME;
    else process.env.DATABASE_FILENAME = database;
  }
  const registration = await app.request
    .post(`${prefix}/auth/local/register`)
    .send({ username: "query-editor", email: "query@example.test", password })
    .expect(200);
  jwt = registration.body.jwt;

  const parent = (
    await editor("post", "/topics")
      .send({ data: { name: "Parent" } })
      .expect(201)
  ).body.data;
  const child = (
    await editor("post", "/topics")
      .send({ data: { name: "Child", parent: parent.documentId } })
      .expect(201)
  ).body.data;
  const related = (
    await editor("post", "/articles")
      .send({ data: { title: "Related" } })
      .expect(201)
  ).body.data;
  article = (
    await editor("post", "/articles?populate=*")
      .send({
        data: {
          title: "Query article",
          description: null,
          quantity: 3,
          topic: child.documentId,
          topics: [parent.documentId, child.documentId],
          relatedArticles: [related.documentId],
          notes: [{ message: "Note" }],
          sections: [
            { __component: "content.note", message: "Zone note" },
            { __component: "content.quote", quotation: "Zone quote" },
          ],
        },
      })
      .expect(201)
  ).body.data;
  await editor("post", "/articles?status=draft")
    .send({ data: { title: "Draft only" } })
    .expect(201);
  for (const field of ["cover", "attachments"]) {
    const uploaded = await editor("post", "/upload")
      .field("ref", "api::article.article")
      .field("refId", article.documentId)
      .field("field", field)
      .attach("files", Buffer.from("query fixture\n"), {
        filename: `${field}.txt`,
        contentType: "text/plain",
      })
      .expect(201);
    files.push(uploaded.body[0]);
  }
  await editor("put", "/landing-page")
    .send({ data: { headline: "Hello", introduction: { quotation: "Hi" } } })
    .expect(200);
});

afterEach(() => {
  if (app) expectNoContractViolations(app.strapi);
});

after(async () => {
  try {
    if (app)
      for (const { id } of files) await editor("delete", `/upload/files/${id}`);
    await app?.destroy();
  } finally {
    if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
  }
});

const matrix = [
  "",
  "populate=*",
  "populate=topic,topics",
  "populate[0]=topic.parent",
  "fields[0]=title&fields[1]=quantity",
  "fields=title,quantity&populate[topic][fields][0]=name",
  "status=draft",
  "status=draft&populate=*",
  "populate[topic][populate][parent]=true&populate[relatedArticles]=true",
  "populate[topics][count]=true&populate[notes][count]=true&populate[sections][count]=true",
  "populate[sections][on][content.note][fields][0]=message",
  "populate[sections][populate]=*",
  "populate[cover]=true&populate[attachments][fields][0]=name",
  "pagination[page]=1&pagination[pageSize]=1",
  "pagination[start]=0&pagination[limit]=2",
  "pagination[withCount]=false",
  "pagination[start]=0&pagination[withCount]=f",
];

test("real article responses match the shape each query selects", async () => {
  for (const query of matrix) {
    await anonymous(`/articles?${query}`).expect(200);
    if (!query.startsWith("pagination")) {
      await anonymous(`/articles/${article.documentId}?${query}`).expect(200);
    }
  }
});

test("topic, single type and write responses match their queries", async () => {
  for (const query of [
    "",
    "populate=*",
    "populate[parent][populate]=*",
    "populate[parent][count]=true",
    "fields[0]=name",
  ]) {
    await anonymous(`/topics?${query}`).expect(200);
  }
  for (const query of [
    "",
    "populate=*",
    "fields[0]=headline",
    "populate[introduction][fields][0]=quotation",
  ]) {
    await anonymous(`/landing-page?${query}`).expect(200);
  }
  await editor("put", `/articles/${article.documentId}?populate[topic]=true`)
    .send({ data: { quantity: 4 } })
    .expect(200);
  await editor(
    "put",
    `/articles/${article.documentId}?status=draft&fields[0]=title`,
  )
    .send({ data: { quantity: 5 } })
    .expect(200);
});

test("a response that drops a key the query selects is a violation", async () => {
  const service = app.strapi.service("api::article.article");
  const findOne = service.findOne;
  service.findOne = async function (...args) {
    const document = await findOne.apply(this, args);
    if (document) delete document.quantity;
    return document;
  };
  try {
    // The static contract accepts the body: every attribute is optional there.
    const invalid = await anonymous(`/articles/${article.documentId}`).expect(
      500,
    );
    assert.equal(invalid.body.error.name, "ContractViolation");
    const [violation] = contractViolations(app.strapi);
    assert.equal(violation.kind, "schema-mismatch");
    assert.match(violation.issues.join("\n"), /quantity/);
    // With `fields` that leave out quantity, the same body is valid.
    resetContractViolations(app.strapi);
    await anonymous(`/articles/${article.documentId}?fields[0]=title`).expect(
      200,
    );
    expectNoContractViolations(app.strapi);
  } finally {
    service.findOne = findOne;
    resetContractViolations(app.strapi);
  }
});

test("a populated relation that is missing is a violation; an unrequested one is too", async () => {
  const service = app.strapi.service("api::article.article");
  const findOne = service.findOne;
  try {
    service.findOne = async function (...args) {
      const document = await findOne.apply(this, args);
      if (document) delete document.topic;
      return document;
    };
    await anonymous(`/articles/${article.documentId}?populate=topic`).expect(
      500,
    );
    resetContractViolations(app.strapi);
    service.findOne = async function (...args) {
      const document = await findOne.apply(this, args);
      if (document) document.topic = null;
      return document;
    };
    await anonymous(`/articles/${article.documentId}`).expect(500);
  } finally {
    service.findOne = findOne;
    resetContractViolations(app.strapi);
  }
});
