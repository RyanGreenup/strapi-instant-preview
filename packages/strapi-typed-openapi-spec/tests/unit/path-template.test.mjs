import { expect, test } from "vitest";

import { getZod } from "../../dist/server/src/adapter/index.js";
import { assemble } from "../../dist/server/src/spec/assemble.js";

test("structurally identical paths share a spelling but retain each method’s parameter contract", () => {
  const app = {
    dirs: { app: { root: process.cwd() } },
    server: {},
    config: { get: (_, fallback) => fallback },
    contentTypes: {},
    components: {},
    plugins: {},
    apis: { demo: { routes: { main: { routes: [] } } } },
  };
  const z = getZod(app);
  app.apis.demo.routes.main.routes.push(
    {
      method: "PUT",
      path: "/posts/:slug([a-z]+)",
      handler: "demo.rename",
      request: { params: { slug: z.string().min(3) } },
      response: z.string(),
    },
    {
      method: "GET",
      path: "/posts/:id(\\d+)",
      handler: "demo.read",
      request: { params: { id: z.string().max(8) } },
      response: z.string(),
    },
  );
  const { get, put } = assemble(app).document.paths["/posts/{id}"];
  expect(get.parameters[0]).toMatchObject({
    name: "id",
    schema: { pattern: "^(?:\\d+)$", maxLength: 8 },
  });
  expect(put.parameters[0]).toMatchObject({
    name: "id",
    schema: { pattern: "^(?:[a-z]+)$", minLength: 3 },
  });
});
