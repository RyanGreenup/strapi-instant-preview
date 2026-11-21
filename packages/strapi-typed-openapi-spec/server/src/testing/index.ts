import { deepStrictEqual } from "node:assert";
import supertest from "supertest";

import type { App } from "../adapter";
import type { BootOptions } from "../boot/with-strapi";

import { listenForTests } from "../adapter";
import { bootStrapi } from "../boot/with-strapi";
import { forceTestValidation, runtime } from "../runtime";

export type TestApp = {
  strapi: App;
  request: supertest.Agent;
  destroy(): Promise<void>;
};
/**
 * `validationMode` defaults to `'spec'`. `'query'` checks the success responses
 * of default core actions against the shape the request's query selects.
 */
export type TestBootOptions = BootOptions & {
  validationMode?: "spec" | "query";
};

/**
 * Rejects if the app boots without active response validation.
 * On success, `request` targets a loopback listener. Call `destroy` in test teardown.
 */
export async function bootTestApp(
  options: TestBootOptions = {},
): Promise<TestApp> {
  const { validationMode, ...boot } = options;
  const strapi = await bootStrapi(boot, (app) =>
    forceTestValidation(app, validationMode),
  );
  try {
    if (!runtime(strapi).enabled) {
      throw new Error(
        "Response validation is disabled; enable the openapi-contract plugin and configure its middleware",
      );
    }
    const server = await listenForTests(strapi);
    return {
      strapi,
      request: supertest(server),
      destroy: () => strapi.destroy(),
    };
  } catch (error) {
    await strapi.destroy();
    throw error;
  }
}

/** Takes a shallow snapshot of the app's accumulated violations without resetting them. */
export function contractViolations(strapi: App) {
  return runtime(strapi).violations.slice();
}
export function resetContractViolations(strapi: App) {
  runtime(strapi).violations.length = 0;
}
/** Fails if validation is off, even when the app has no recorded violations. */
export function expectNoContractViolations(strapi: App) {
  if (!runtime(strapi).enabled)
    throw new Error("Response validation is disabled");
  deepStrictEqual(
    contractViolations(strapi),
    [],
    "Content API contract violations",
  );
}
