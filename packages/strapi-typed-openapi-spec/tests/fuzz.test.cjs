const { mkdtemp, mkdir, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { after, before, test } = require("node:test");
const fc = require("fast-check");
const qs = require("qs");
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats").default;
const {
  bootTestApp,
  contractViolations,
  resetContractViolations,
} = require("../dist/server/src/testing/index.js");
const { schemaArb, mutate } = require("./fuzz/arbitrary.cjs");

const appDir = join(__dirname, "fixture-app");
const reportDir = join(__dirname, ".fuzz");
const runs = Number(process.env.FUZZ_RUNS ?? 40);
const seed = Number(process.env.FUZZ_SEED ?? Date.now() % 2 ** 31);
const only = process.env.FUZZ_OPS
  ? new RegExp(process.env.FUZZ_OPS)
  : undefined;
const password = "fixture-password-only!";
const json = "application/json";

const SKIP = new Set([
  "POST /auth/change-password",
  "POST /auth/logout",
  "DELETE /auth/sessions/{sessionId}",
  "PUT /users/{id}",
  "DELETE /users/{id}",
  "PUT /users-permissions/roles/{role}",
  "DELETE /users-permissions/roles/{role}",
  "GET /connect/{wildcard}",
  "POST /email",
  "POST /upload",
]);

let app;
let jwt;
let doc;
let prefix;
let databaseDir;
const idPool = [];
const findings = new Map();
const serverErrors = [];
const stats = {};

before(async () => {
  const previous = process.env.FIXTURE_EXPOSE_SPEC;
  const database = process.env.DATABASE_FILENAME;
  databaseDir = await mkdtemp(join(tmpdir(), "openapi-contract-fuzz-"));
  process.env.DATABASE_FILENAME = join(databaseDir, "app.sqlite");
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
    .post("/content/auth/local/register")
    .send({ username: "fuzz-editor", email: "fuzz@example.test", password })
    .expect(200);
  jwt = registration.body.jwt;
  doc = (
    await app.request
      .get("/content/openapi-contract/spec.json")
      .set("Authorization", `Bearer ${jwt}`)
      .expect(200)
  ).body;
  prefix = new URL(doc.servers[0].url).pathname.replace(/\/$/, "");
  for (const [path, data] of [
    ["/topics", { name: "Seed topic" }],
    ["/articles", { title: "Seed article" }],
  ]) {
    const created = await app.request
      .post(`${prefix}${path}`)
      .set("Authorization", `Bearer ${jwt}`)
      .send({ data });
    if (created.body?.data?.documentId)
      idPool.push(created.body.data.documentId);
  }
  const logError = app.strapi.log.error.bind(app.strapi.log);
  app.strapi.log.error = (message, ...rest) => {
    serverErrors.push(
      message instanceof Error ? message.message : String(message),
    );
    return logError(message, ...rest);
  };
  resetContractViolations(app.strapi);
});

after(async () => {
  try {
    await writeReport();
  } finally {
    try {
      await app?.destroy();
    } finally {
      if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
    }
  }
});

async function writeReport() {
  const all = [...findings.values()];
  const byOracle = Object.groupBy(all, (f) => f.oracle);
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    join(reportDir, "report.json"),
    JSON.stringify({ seed, runs, stats, findings: all }, null, 2),
  );
  console.log(
    `\nfuzz seed=${seed} runs=${runs}: ${all.length} distinct findings` +
      Object.entries(byOracle)
        .map(
          ([oracle, list]) =>
            `\n  ${oracle}: ${list.length}${INFORMATIONAL.has(oracle) ? " (informational)" : ""}`,
        )
        .join("") +
      `\nreport: ${join(reportDir, "report.json")}`,
  );
}

function validators() {
  const id = "urn:openapi-contract:fuzz";
  const make = (coerceTypes) => {
    const ajv = new Ajv2020({ strict: false, allErrors: false, coerceTypes });
    addFormats(ajv);
    ajv.addFormat("binary", true);
    ajv.addSchema({ $id: id, ...doc });
    return (pointer) => ajv.compile({ $ref: `${id}#${pointer}` });
  };
  return { body: make(false), param: make("array") };
}

const token = (s) => s.replaceAll("~", "~0").replaceAll("/", "~1");
const pathText = (value) =>
  typeof value === "string" ? value : JSON.stringify(value);

function onWire(name, value) {
  return qs.parse(qs.stringify({ [name]: value }, { encodeValuesOnly: true }), {
    depth: 20,
    arrayLimit: 100,
  })[name];
}

function operationParts(path, method, op, compile) {
  const base = `/paths/${token(path)}/${method}`;
  const opts = { idPool };
  const params = [
    ...(doc.paths[path].parameters ?? []),
    ...(op.parameters ?? []),
  ];
  const parts = params
    .filter((p) => p.schema && ["path", "query"].includes(p.in))
    .map((p) => {
      const index = (op.parameters ?? []).indexOf(p);
      const pointer =
        index >= 0
          ? `${base}/parameters/${index}/schema`
          : `/paths/${token(path)}/parameters/${doc.paths[path].parameters.indexOf(p)}/schema`;
      const validate = compile.param(pointer);
      const required = p.in === "path" || !!p.required;
      return {
        kind: p.in,
        name: p.name,
        required,
        arb: schemaArb(p.schema, doc, 0, opts),
        check(value) {
          if (value === undefined)
            return required ? "missing required parameter" : undefined;
          const wire =
            p.in === "path" ? pathText(value) : onWire(p.name, value);
          if (wire === undefined)
            return required ? "parameter vanished on the wire" : undefined;
          return validate(structuredClone(wire))
            ? undefined
            : describe(validate.errors);
        },
      };
    });
  const body = op.requestBody?.content?.[json];
  if (body?.schema) {
    const pointer = `${base}/requestBody/content/${token(json)}/schema`;
    const validate = compile.body(pointer);
    const status = parts.findIndex(
      (part) => part.kind === "query" && part.name === "status",
    );
    const branches =
      status >= 0 &&
      body.schema.anyOf?.length === 2 &&
      /status=draft/.test(body.schema.description ?? "")
        ? [
            compile.body(`${pointer}/anyOf/0`),
            compile.body(`${pointer}/anyOf/1`),
          ]
        : undefined;
    const required = !!op.requestBody.required;
    parts.push({
      kind: "body",
      name: "body",
      required,
      arb: schemaArb(body.schema, doc, 0, opts),
      check(value, values) {
        if (value === undefined)
          return required ? "missing required body" : undefined;
        const check = branches
          ? branches[values?.[status] === "draft" ? 1 : 0]
          : validate;
        return check(value) ? undefined : describe(check.errors);
      },
    });
  }
  return parts;
}

const describe = (errors) =>
  (errors ?? [])
    .slice(0, 1)
    .map((e) => `${e.keyword} at ${e.schemaPath}`)
    .join("; ") || "invalid";
const jsonSafe = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function requestArb(parts, mode) {
  const valueArb = (part, mutated) => {
    if (mutated) return mutate(part.arb).map(jsonSafe);
    const arb = part.arb.map(jsonSafe);
    return part.required ? arb : fc.option(arb, { nil: undefined });
  };
  const build = (target) =>
    fc
      .record({
        auth: fc.boolean(),
        values: fc.tuple(
          ...parts.map((part, i) => valueArb(part, i === target)),
        ),
      })
      .map(({ auth, values }) => ({ mode, auth, target, values }));
  if (mode === "valid" || !parts.length) return build(-1);
  return fc.integer({ min: 0, max: parts.length - 1 }).chain(build);
}

function toHttp(path, parts, values) {
  let url = path;
  const query = {};
  let body;
  parts.forEach((part, i) => {
    const value = values[i];
    if (value === undefined) return;
    if (part.kind === "path")
      url = url.replace(`{${part.name}}`, encodeURIComponent(pathText(value)));
    else if (part.kind === "query") query[part.name] = value;
    else body = value;
  });
  const search = qs.stringify(query, { encodeValuesOnly: true });
  return { url: `${prefix}${url}${search ? `?${search}` : ""}`, body };
}

const normalize = (text) =>
  String(text)
    .replace(
      /Invalid key [^|]*/g,
      (m) => `Invalid key * ${m.match(/ at ([^.\s]+)/)?.[1] ?? ""}`,
    )
    .replace(/\b[a-z][a-z0-9]{23}\b/g, "<id>")
    .replace(/"[^"]*"|'[^']*'/g, '"*"')
    .replace(/\d+/g, "N")
    .slice(0, 300);

function record(op, oracle, status, detail, example) {
  const key = `${op} | ${oracle} | ${status} | ${normalize(detail)}`;
  const existing = findings.get(key);
  if (existing) existing.count += 1;
  const text = String(detail);
  const kept =
    text.length > 1200 ? `${text.slice(0, 700)} ... ${text.slice(-500)}` : text;
  if (!existing)
    findings.set(key, { op, oracle, status, detail: kept, count: 1, example });
}

const INFORMATIONAL = new Set([
  "accepted-invalid-request",
  "semantic-rejection",
  "invalid-input-crash",
  "control-violation",
  "strapi-bug",
]);

const STRAPI_BUGS = [/FOREIGN KEY constraint failed/];

const SEMANTIC = [
  /not found/,
  /do not exist/,
  /not related to the entity/,
  /Invalid identifier or password/,
  /Invalid token/,
  /provider is disabled/,
  /Passwords do not match/,
  /Missing refresh token/,
  /must be defined/,
  /less than 73 bytes/,
  /Register action is currently disabled/,
  /Email or Username are already taken/,
  /already confirmed/,
  /This attribute must be unique/,
];

function semantic(body) {
  const error = body?.error ?? {};
  const messages = error.details?.errors?.length
    ? error.details.errors.map((e) => e.message)
    : [error.message];
  return messages.every((message) =>
    SEMANTIC.some((pattern) => pattern.test(String(message))),
  );
}

function errorDetail(body) {
  const error = body?.error ?? {};
  const nested =
    error.details?.errors?.map(
      (e) => `${(e.path ?? []).join(".")}: ${e.message}`,
    ) ?? [];
  return [error.name, error.message, ...nested.slice(0, 3)]
    .filter(Boolean)
    .join(" | ");
}

async function exercise(op, path, method, parts, sample) {
  const reasons = parts.map((part, i) =>
    part.check(sample.values[i], sample.values),
  );
  const classified =
    sample.mode === "valid"
      ? reasons.every((r) => r === undefined)
      : reasons[sample.target] !== undefined;
  if (!classified) {
    stats[op].discarded += 1;
    const why =
      sample.mode === "valid"
        ? reasons
            .map((r, i) => r && `${parts[i].kind} ${parts[i].name}: ${r}`)
            .find(Boolean)
        : `mutated ${parts[sample.target].kind} ${parts[sample.target].name} stayed valid`;
    if (stats[op].why.length < 3 && !stats[op].why.includes(why))
      stats[op].why.push(why);
    return true;
  }
  stats[op].sent += 1;
  const { url, body } = toHttp(path, parts, sample.values);
  if (
    parts.some(
      (part, i) =>
        part.kind === "path" && pathText(sample.values[i] ?? "") === "",
    )
  ) {
    stats[op].discarded += 1;
    return true;
  }
  const example = {
    mode: sample.mode,
    auth: sample.auth,
    method: method.toUpperCase(),
    url,
    body,
  };
  if (process.env.FUZZ_TRACE)
    console.error(
      `fuzz> ${example.method} ${url}${body === undefined ? "" : ` ${JSON.stringify(body)}`}`,
    );
  resetContractViolations(app.strapi);
  serverErrors.length = 0;
  let res;
  try {
    let req = app.request[method](url);
    if (sample.auth) req = req.set("Authorization", `Bearer ${jwt}`);
    res = await (body === undefined
      ? req
      : req.set("Content-Type", json).send(JSON.stringify(body)));
  } catch (error) {
    record(op, "harness-error", 0, error.message, example);
    return true;
  }
  example.status = res.status;
  example.response = res.body;
  const control =
    op === "GET /contract/echo" &&
    (sample.mode === "invalid" || /[?&]breakContract=yes(&|$)/.test(url));
  for (const v of contractViolations(app.strapi)) {
    record(
      op,
      control ? "control-violation" : "response-contract",
      v.status,
      `${v.kind}${v.issues.length ? `: ${v.issues.join("; ")}` : ""}`,
      example,
    );
  }
  const contractError = res.body?.error?.name === "ContractViolation";
  if (res.status >= 500 && !contractError) {
    const cause = serverErrors.join(" | ") || errorDetail(res.body);
    const oracle =
      sample.mode !== "valid"
        ? "invalid-input-crash"
        : STRAPI_BUGS.some((pattern) => pattern.test(cause))
          ? "strapi-bug"
          : "server-error";
    record(op, oracle, res.status, cause, example);
  }
  if (sample.mode === "valid" && res.status === 400) {
    record(
      op,
      semantic(res.body) ? "semantic-rejection" : "rejected-valid-request",
      400,
      errorDetail(res.body),
      example,
    );
  }
  if (sample.mode === "invalid" && res.status >= 200 && res.status < 300) {
    const part = parts[sample.target];
    record(
      op,
      "accepted-invalid-request",
      res.status,
      `${part.kind} ${part.name}: ${reasons[sample.target]}`,
      example,
    );
  }
  for (const id of [res.body?.data?.documentId].flat())
    if (typeof id === "string" && !idPool.includes(id)) idPool.push(id);
  return true;
}

test("fuzz every Content API operation against the served OpenAPI document", async (t) => {
  const compile = validators();
  const operations = Object.entries(doc.paths)
    .flatMap(([path, item]) =>
      Object.keys(item)
        .filter((method) =>
          ["get", "post", "put", "patch", "delete"].includes(method),
        )
        .map((method) => ({
          path,
          method,
          op: `${method.toUpperCase()} ${path}`,
        })),
    )
    .filter(({ op }) => !SKIP.has(op) && (!only || only.test(op)))
    .sort((a, b) => (a.method === "delete") - (b.method === "delete"));

  for (const [index, { path, method, op }] of operations.entries()) {
    await t.test(op, async () => {
      stats[op] = { sent: 0, discarded: 0, why: [] };
      const parts = operationParts(
        path,
        method,
        doc.paths[path][method],
        compile,
      );
      for (const mode of ["valid", "invalid"]) {
        if (mode === "invalid" && !parts.length) continue;
        const property = fc.asyncProperty(requestArb(parts, mode), (sample) =>
          exercise(op, path, method, parts, sample),
        );
        const result = await fc.check(property, {
          numRuns: runs,
          seed: seed + index * 2 + (mode === "invalid"),
        });
        if (result.failed)
          record(
            op,
            "harness-error",
            0,
            result.errorInstance?.message ?? "property failed",
            null,
          );
      }
      const mine = [...findings.values()].filter(
        (f) => f.op === op && !INFORMATIONAL.has(f.oracle),
      );
      if (mine.length) {
        throw new Error(
          `${mine.length} finding(s) (sent ${stats[op].sent}, discarded ${stats[op].discarded}):\n` +
            mine
              .map(
                (f) =>
                  `  [${f.oracle}] ${f.status} x${f.count}: ${f.detail.slice(0, 240)}\n    e.g. ${f.example?.method} ${f.example?.url}`,
              )
              .join("\n"),
        );
      }
    });
  }
  await t.test(
    "oracle self-check: the deliberately broken fixture route is caught",
    () => {
      if (!operations.some(({ op }) => op === "GET /contract/echo")) return;
      const caught = [...findings.values()].some(
        (f) => f.oracle === "control-violation",
      );
      if (!caught)
        throw new Error(
          "GET /contract/echo?breakContract=yes was never reported; is response validation running?",
        );
    },
  );
});
