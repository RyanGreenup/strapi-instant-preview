"use strict";

const { copyFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");

async function generateClient(document, output) {
  const { generate } = await import("orval");
  await mkdir(output, { recursive: true });
  const serializer = join(output, "query-string.ts");
  await copyFile(
    join(__dirname, "client/query-string.ts.template"),
    serializer,
  );
  await generate({
    input: { target: document },
    output: {
      target: join(output, "generated/cms.ts"),
      client: "fetch",
      mode: "single",
      tsconfig: { compilerOptions: { module: "NodeNext" } },
      override: {
        header: false,
        fetch: { runtimeImplementationStyle: "shared" },
        paramsSerializer: { path: serializer, name: "serializeStrapiQuery" },
      },
    },
  });
  await copyFile(
    join(__dirname, "client/index.ts.template"),
    join(output, "index.ts"),
  );
}

module.exports = { generateClient };
