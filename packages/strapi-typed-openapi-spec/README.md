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
const response = await cms.articles({ pagination: { page: 1 } });
if (response.status === 200) console.log(response.data);
```

For authenticated server-side calls, pass `token` to `createCmsClient`, remember
not to embed private tokens in browser code.

## Use the tooling from TypeScript

```ts
import {
  generateClient,
  loadContract,
  writeContract,
} from "@ryangreenup/strapi-typed-openapi-spec/tooling";

const contract = await loadContract({ appDir: "./cms" });
await writeContract(contract, { out: "./specification.yaml" });
await generateClient(contract.document, "./frontend/src/cms-client");
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
