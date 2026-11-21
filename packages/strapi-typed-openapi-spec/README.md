# Strapi OpenAPI Contract

Generate an OpenAPI 3.1 contract from a booted Strapi v5 app. The CLI does not
replace `strapi openapi generate` or patch Strapi. The plugin can also check
HTTP responses against the generated contract in tests.

## Generate a contract

Install `@moworks/strapi-typed-openapi-spec` and `zod` 4 in a Strapi app running
on Node.js 22 or later. Tested on Strapi **5.62.0** and **5.63.0**. Other
versions within the package's peer range run the same probes and emit a warning.

```sh
pnpm exec openapi-contract probe
pnpm exec openapi-contract generate --out specification.json --coverage coverage.json
pnpm exec openapi-contract check --against specification.json
pnpm exec openapi-contract audit
```

Each command accepts `--app <directory>`. `generate` also accepts
`--format yaml`; `check` accepts JSON or YAML and compares the documents without
regard to object key order. `audit --baseline audit.json` compares installed
content-API controller status sites with a custom JSON array of audit hits. The
audit parses installed controller files as JavaScript. A syntax error stops the
audit and identifies the file.

`generate` and `check` accept `--config <file.json>` to override plugin settings
without installing or enabling the plugin in the app. Unknown config keys are
errors, including keys inside `info` and `servers` entries. Validation reports
all invalid fields with their paths.

Pass `--default-non-nullable false` to `openapi-typescript` so its generated
types keep request properties with defaults optional.

Request bodies follow Strapi's write rules:

- A field with `conditions.visible` is typed by its type and column size only,
  because Strapi skips every rule of a hidden field. On create, `if`/`then`
  rules apply its required check and value rules while the condition makes it
  visible. A condition that cannot be represented leaves the field relaxed.
- A required relation or media field is required only when
  `api.documents.strictRelations` is `true`, and never for drafts.

The CLI does not require the plugin to be enabled. It **does** connect to the
database and runs your app's register and bootstrap hooks. Use a disposable
database. For a Strapi app with its standard environment-based configuration,
set `DATABASE_CLIENT=sqlite` and `DATABASE_FILENAME=.tmp/openapi.db` and install
`better-sqlite3`. Skip side effects in hooks and disable cron in your server
config when `OPENAPI_CONTRACT_GENERATING === '1'`.

## Declare custom responses

If a custom route has no upstream response schema, declare its status codes in
the route file. `defineResponses` returns the route unchanged. A single Zod
schema means `200`; a `null` entry means no JSON body.

```ts
import { defineResponses } from "@moworks/strapi-typed-openapi-spec";
import { z } from "zod/v4";

export default {
  routes: [
    defineResponses(
      {
        method: "POST",
        path: "/articles/:id/publish",
        handler: "article.publish",
      },
      { 200: z.object({ published: z.boolean() }), 409: null },
    ),
  ],
};
```

A core route keeps the core response contract when the project overrides its
controller action or service method, or adds route policies or middlewares.
`generate` prints a notice for each such route and marks it `customized` in the
coverage report. If the override changes the response, declare the route's
responses; in every case, check responses at runtime in your API tests.

Error responses are specific to each route. Default core actions list `404` only
where Strapi can answer it (collection `findOne` and `update`, single-type
`find`), and routes that accept a body list `413`. Each error status has its own
schema (`StrapiError404`, ...) with `error.status` fixed to the HTTP status.

### Published and draft documents

For `api::` content types, a response document is published or draft:

- A published document (and any document of a type without draft and publish)
  has non-null required values and the published-only bounds (`minLength`,
  `min`, item counts) wherever a field is present. A required field with
  `conditions.visible` is non-null only when the controlling field is present
  and makes it visible.
- A draft document has `publishedAt: null` and only the rules Strapi checks on
  drafts.
- A populated draft-and-publish relation has the state of its owner. Under a
  type without draft and publish it can be either, because `status=draft` still
  populates draft versions.

Draft-and-publish operations name the exact schema for each `status` value in
`x-strapi-request-status` (create and update bodies) and
`x-strapi-response-status` (`find`, `findOne`, `create` and `update` success
responses). Writes default to `published` like reads: Strapi's core service
publishes a create or update unless the query sets `status=draft`, and returns
the published entry. The operation itself keeps the union, so a validator that
ignores the extensions stays correct.

Required scalars of `plugin::upload.file` (such as `name`, `hash`, `mime`,
`size`, `url` and `provider`) are non-null. The upload service writes file rows
without the entity validator, but it sets each of these fields on every write
path.

Set `publishedResponseRules: false` for an app whose stored data was written
outside the Document Service or the upload service, or before a rule was
tightened.

Other extensions describe what JSON Schema cannot:

- `x-strapi-conditions`: the raw `conditions.visible` rules of an object's
  fields. Rules built from `==`, `!=`, `===`, `!==`, `in`, `and`, `or`, `!` and
  `if` over boolean, enumeration, string or number fields also become
  `if`/`then` constraints.
- `x-strapi-regex`: an attribute `regex` that JSON Schema would read differently
  from Strapi (Unicode mode). It is checked in `zod` mode only.
- `x-strapi-coerces-numeric-string`: Strapi casts a numeric string sent to an
  integer, float or decimal field. The contract still types the field as a
  number (see `server/src/schemas/numeric-strings.ts`).

With the plugin enabled, use
`strapi.plugin('openapi-contract').service('contract').declare(selector, responses)`
in the app's `register` hook. Select by `{ method, path }` (including the router
prefix but not the REST prefix), or by
`{ handler: 'api::article.article.publish' }`. Unmatched or conflicting
declarations fail generation.

### Rich text editor properties

Blocks nodes allow unknown keys, because Strapi stores any key that an editor
adds to a node. A generated client sees such a key as `unknown`. To type the
keys that your editor writes, declare them in `blocksProperties`, by node type
(`paragraph`, `quote`, `code`, `heading`, `list`, `list-item`, `image`, `text`
or `link`):

```json
{
  "blocksProperties": {
    "paragraph": { "fontSize": { "enum": [14, 16, 18] } },
    "text": { "superscript": "boolean", "subscript": "boolean" }
  }
}
```

A type is `"string"`, `"number"`, `"integer"`, `"boolean"`, or
`{ "enum": [...] }`.

Each declared key is optional, in request bodies and responses and other unknown
keys still come through. Strapi does not check these keys, so a declaration is
**your claim** about your editor; response validation checks it like the rest of
the contract. A key that Strapi defines on that node (such as `children` or
`bold`) cannot be declared.

## Validate responses

Enable `openapi-contract` in `config/plugins` and add
`plugin::openapi-contract.validate-responses` immediately **before**
`strapi::errors` in `config/middlewares`. Use the middleware in tests or
staging, not production. It checks the finished response without rewriting a
valid body.

| `config/plugins` → `openapi-contract.config` | Default              | Behavior                                                                                                                                                |
| -------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateResponses`                          | `false`              | Check content-API responses at runtime.                                                                                                                 |
| `validationMode`                             | `'zod'`              | Use `'spec'` to check the published JSON Schema with Ajv. Use `'query'` to check each response against the shape its request query selects (see below). |
| `failOn`                                     | `'error'`            | Return `500` on violation. `'log'` preserves the response.                                                                                              |
| `strict`                                     | `true`               | Fail generation for uncovered routes or unsupported attributes.                                                                                         |
| `servers`                                    | Derived              | Override the server list.                                                                                                                               |
| `includePlugins`                             | All                  | Limit which plugin routes appear in the contract.                                                                                                       |
| `requireBearer`                              | `false`              | Document bearer authentication as required on routes that do not explicitly opt out. Use when the app grants no public content access.                  |
| `documentIdPattern`                          | `'cuid2'`            | Use `'loose'` for apps with imported or legacy IDs.                                                                                                     |
| `strictResponseObjects`                      | `true`               | Reject undeclared keys in document, component, and response envelope objects.                                                                           |
| `publishedResponseRules`                     | `true`               | Type `api::` responses as published or draft documents (see above).                                                                                     |
| `blocksProperties`                           | None                 | Type the properties that the app's rich text editor adds to Blocks nodes (see above).                                                                   |
| `exposeSpec`                                 | `false`              | Serve a cached spec at `<restPrefix>/openapi-contract/spec.json`.                                                                                       |
| `exposeSpecAuth`                             | `true`               | Require bearer credentials on the spec endpoint.                                                                                                        |
| `info`                                       | App package metadata | Override title, version, or description.                                                                                                                |

In tests, import `bootTestApp` and `expectNoContractViolations` from
`@moworks/strapi-typed-openapi-spec/testing`. With the plugin and middleware
configured, `bootTestApp({ appDir })` returns `{ strapi, request, destroy }`. It
forces spec-mode validation and listens on a random local port. Pass
`validationMode: 'query'` to force query mode instead. Call
`expectNoContractViolations(strapi)` after each test and `await destroy()` at
teardown.

Response checking skips HEAD, streams, the v4 response format, and encoded
source maps. The contract does not vary by query or role.

Route paths use Strapi's `path-to-regexp` v6 syntax. The probe rejects optional
or repeated segments, duplicate parameter names, and literal braces. Its error
names the method, path, and owning API or plugin. Methods that differ only in
parameter names share one OpenAPI path but keep their own parameter constraints.

The probe checks upstream request and response schemas against the app's Zod
even when a custom declaration overrides the response.

For published creates, a required field can depend on another field's value.
Loose JSON Logic comparisons (`==` and `!=`) are supported for enum and Boolean
fields, including null and omitted values. For other controlling field types,
generation reports the dependent field in coverage and fails in strict mode.

### Query mode

In the static contract every attribute except `id` and `documentId` is optional,
because `fields` and `populate` decide which keys Strapi sends. With
`validationMode: 'query'`, the middleware builds the expected shape from each
request's query:

- Without `fields`, every non-private scalar is present. With `fields`, the
  listed fields are present and the others may be left out.
- A relation, media field, component or dynamic zone is present only when
  `populate` asks for it (`*`, a list, dot paths, an object, or `on` fragments).
  `populate[x][count]=true` gives `{ count }`, except on a dynamic zone, where
  Strapi ignores `count` and sends the entries.
- On a published read, `publishedAt` and required scalars are non-null. This
  applies only to `api::` content types and components, and not to fields with
  `conditions.visible`. A create or update response is published unless the
  query sets `status=draft`. Drafts keep them nullable. A populated document
  follows the requested status only if its model has draft and publish.
- List meta matches the pagination style (`page` and `pageSize`, or `start` and
  `limit`). `total` and `pageCount` are present unless `withCount` is false
  (default from `api.rest.withCount`).

Query mode applies to the success response of default core actions (`find`,
`findOne`, `create`, `update`). Customized core routes, other routes, error
statuses, and queries the plugin does not model use the `'zod'` check. Entries
of polymorphic relations keep the static schema.

## Development

This package lives in the workspace. From the repository root, run
`pnpm turbo run test --filter=@moworks/strapi-typed-openapi-spec`; turbo builds
the plugin with tsdown first. Run `pnpm run test:fuzz` in this directory, after
a build, for the property-based query tests. `tests/fixture-app` is a separate
workspace package that depends on this one. The fixture checks live SQLite
responses, the stock route inventory, and client generation with
`openapi-typescript` and `@hey-api/openapi-ts`. To run the API tests against an
empty PostgreSQL database, set `DATABASE_CLIENT=postgres` and `DATABASE_URL`,
then run `node --test tests/api.test.cjs` after building.

To refresh the fixture snapshot after an intentional contract change, build the
plugin and run:

```sh
node bin/openapi-contract.js generate --app tests/fixture-app \
  --out tests/fixture-app/openapi.snapshot.json
```

Review the snapshot diff before committing it.
