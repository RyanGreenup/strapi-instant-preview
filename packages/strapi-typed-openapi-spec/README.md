# Strapi OpenAPI Contract

Generate an OpenAPI 3.1 contract from a Strapi v5 app and generate an API
client.

## Usage

### OpenAPI Schema

```sh
pnpm exec openapi-contract probe
pnpm exec openapi-contract generate --out specification.json --coverage coverage.json
pnpm exec openapi-contract check --against specification.json
pnpm exec openapi-contract audit
```

Run `openapi-contract <command> --help` for command-specific options. Use
`--app <directory>` to target another Strapi project. File arguments are
relative to your working directory.

### Generate a fetch client

From the Strapi project, run the following with Node.js 22.18 or later:

```sh
pnpm exec openapi-contract client --out ../frontend/src/cms-client
```

The command boots the app and generates TypeScript from its current routes and
schemas. The frontend only needs `fetch` and the generated API client is
tree-shakeable [^252f10c].

The generator owns every file in the output folder, so do not edit them: the
next run replaces them. To check in CI that a committed client still matches the
app, run the same command with `--check`. It generates into a temporary folder,
changes nothing, and fails with the names of the files that differ:

```sh
pnpm exec openapi-contract client --out ../frontend/src/cms-client --check
```

[^252f10c]:
    This is why the call-site must use `bindClient`, if this was automated the
    whole API Client would be pulled in if much of it was unused.

In the frontend:

```ts
import {
  apiArticleArticleFind,
  bindClient,
  createCmsClient,
} from "./cms-client";

// Create the client
const connection = createCmsClient({ baseUrl: "https://cms.example.com/api" });

// Use the helper to create an object with methods
const cms = bindClient(connection, { articles: apiArticleArticleFind });

// Get the articles
const result = await cms.articles({ pagination: { page: 1 } });
if (!result.ok) {
  switch (result.error.kind) {
    case "http":
      // `status` narrows `data` to that status's error body
      if (result.error.status === 401) console.error(result.error.data.error);
      break;
    case "validation":
      console.error(result.error.issues);
      break;
  }
  throw result.error;
}
console.log(result.value.data);
```

Bound methods never throw or reject. Each call resolves to
`{ ok: true, value: { data, status, headers } }` for a 2xx response, or
`{ ok: false, error }`. The `error` is an `Error` subclass with a `kind`:

| `kind`            | When                                           |
| ----------------- | ---------------------------------------------- |
| `http`            | The server returned a non-2xx status.          |
| `validation`      | A 2xx body did not match the contract.         |
| `json-parse`      | A body that claimed to be JSON did not parse.  |
| `timeout`         | `timeoutMs` (default 10 seconds) elapsed.      |
| `aborted`         | The caller's `signal` aborted the request.     |
| `network`         | No response arrived.                           |
| `invalid-request` | The request could not be built or was refused. |
| `unexpected`      | Anything else, such as a validator that threw. |

Options passed to one call are merged over the client's. An option set to
`undefined` is ignored, so `{ ...options, fetch: undefined }` keeps the client's
`fetch`, and with it the base URL, token and timeout.

Path parameters are encoded with `encodeURIComponent`, so an ID cannot add path
segments or a query string. The client refuses an empty ID, `.` or `..` before
it sends anything: an empty ID would reach a different route (`/articles/` is
the list) and a dot segment would climb out of the API root. An error raised
before the request is sent names the operation by its method and path template,
such as `PUT /articles/{id}`.

#### Populate-aware types

A literal `populate` argument types the response. The relations, media and
components it describes are present in the type, not merely a count:

```ts
const result = await cms.articles({ populate: { topic: true } });
if (result.ok) {
  const [article] = result.value.data.data;
  article.topic; // Topic | null: always present, not just a count
  article.cover; // error: cover was not populated
  article.topic?.parent; // error: `topic: true` populates one level
}
```

Every form Strapi accepts works including a key (`"cover"`), a comma list
(`"cover,topics"`), dot paths (`["topic.parent"]`), `"*"`, nested objects, and
`on` for dynamic zones. `{ count: true }` gives `{ count }` where the contract
says Strapi sends one, and the related entries where Strapi ignores it.

The response preserves its generated type when the call has no `populate`

#### Relation counts

Strapi answers `populate[key][count]=true` with `{ count }` instead of the
related entries, so a relation's type includes that shape unless the call's
`populate` tree types it (see above). If no query asks for counts, bind with
`populated: true`. A body that holds a count then fails validation, and the
types leave counts out:

```ts
const cms = bindClient(
  connection,
  { articles: apiArticleArticleFind },
  { populated: true },
);
```

#### Response validation

Operations imported from `./cms-client` check each 2xx body against the
contract's JSON Schema with [TypeBox](https://github.com/sinclairzx81/typebox),
so the frontend needs `typebox` 1.4 or later. To skip validation, import the
same names from `./cms-client/unchecked` instead, that does not bring in Typebox
so it's left out of the bundle.

Each schema is compiled on first use. TypeBox compiles it to JavaScript where
the environment allows it, and interprets it where it does not, such as under a
Content-Security-Policy without `unsafe-eval`. If a response schema has a `$ref`
that does not resolve, `openapi-contract client` prints a warning and that
operation is not validated.

For authenticated server-side calls, pass `token` to `createCmsClient`, remember
not to embed private tokens in browser code.

Typebox is used over Zod as it gives stricter typing for this use case and a
smaller bundle size. Zod is used to infer the types as it builds on top of
Strapi's Zod schema which is used in the routes.

## Use the tooling from TypeScript

```ts
import {
  checkClient,
  generateClient,
  loadContract,
  writeContract,
} from "@ryangreenup/strapi-typed-openapi-spec/tooling";

const contract = await loadContract({ appDir: "./cms" });
await writeContract(contract, { out: "./specification.yaml" });
const warnings = await generateClient(
  contract.document,
  "./frontend/src/cms-client",
);
// [] when the committed client matches, else the files that differ.
const stale = await checkClient(contract.document, "./frontend/src/cms-client");
```

The same entry point exports `checkContract`, `probeContract`, and
`auditContract`. To embed the CLI as a Citty subcommand, import
`openapiContractCommand` from `@ryangreenup/strapi-typed-openapi-spec/cli`.

## Declare custom responses

If a custom route has no upstream response schema, declare its status codes in
the route file. `defineResponses` returns the route unchanged. A single Zod
schema means `200`; a `null` entry means no JSON body.

```ts
import { defineResponses } from "@ryangreenup/strapi-typed-openapi-spec";
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
