import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { OpenAPIDocument } from "../spec/assemble";

// oxlint-disable-next-line unicorn/prefer-module -- Strapi loads this package as CommonJS.
const templates = join(__dirname, "templates");

export async function generateClient(
  document: OpenAPIDocument,
  output: string,
): Promise<void> {
  const { generate } = await import("orval");
  await mkdir(output, { recursive: true });
  const serializer = join(output, "query-string.ts");
  await copyFile(join(templates, "query-string.ts.template"), serializer);
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
    join(templates, "index.ts.template"),
    join(output, "index.ts"),
  );
}
