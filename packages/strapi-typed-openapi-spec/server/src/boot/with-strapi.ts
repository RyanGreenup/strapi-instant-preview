import type * as Strapi from "@strapi/strapi";

import { resolve } from "node:path";

import type { App } from "../adapter";

import { packageRequire } from "../adapter";

/** The directory containing the Strapi project's `package.json`. Defaults to the current working directory. */
export type BootOptions = { appDir?: string };

/**
 * Loads the app without calling `listen`. `beforeLoad` can configure the instance before its load hooks run.
 * The caller must destroy the returned app. If load or the callback fails, this function attempts teardown.
 */
export async function bootStrapi(
  options: BootOptions = {},
  beforeLoad?: (app: App) => void,
): Promise<App> {
  const appDir = resolve(options.appDir ?? process.cwd());
  const { createStrapi, compileStrapi }: typeof Strapi =
    packageRequire(appDir)("@strapi/strapi");
  const app = createStrapi(await compileStrapi({ appDir }));
  try {
    beforeLoad?.(app);
    return await app.load();
  } catch (error) {
    try {
      await app.destroy();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Strapi load and cleanup failed",
      );
    }
    throw error;
  }
}

/**
 * Supplies a loaded app for the duration of `fn`, then destroys it even if `fn` rejects.
 * Do not run concurrently: the function sets the process-wide `OPENAPI_CONTRACT_GENERATING` flag
 * before boot and restores its previous value after teardown.
 */
export async function withStrapi<T>(
  fn: (app: App) => T | Promise<T>,
  options?: BootOptions,
): Promise<T> {
  const previous = process.env.OPENAPI_CONTRACT_GENERATING;
  process.env.OPENAPI_CONTRACT_GENERATING = "1";
  try {
    const app = await bootStrapi(options);
    try {
      return await fn(app);
    } finally {
      await app.destroy();
    }
  } finally {
    if (previous === undefined) delete process.env.OPENAPI_CONTRACT_GENERATING;
    else process.env.OPENAPI_CONTRACT_GENERATING = previous;
  }
}
