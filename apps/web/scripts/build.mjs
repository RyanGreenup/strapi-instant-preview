/**
 * Builds the site with a running CMS.  
 *
 * Start Strapi so Astro can use it for the build (as it relies on the Article over the REST API).
 *
 *
 * Turbo can't do this with `with` or a health-check task as it stops a `with`
 * task when the task that started it ends, not when its dependents end.
 *
 * A preview build (CMS_PREVIEW=true) does not read the CMS, so it skips Strapi.
 *
 * This is required for a static SSG build, it's not if Astro is server rendered
 * SSR as it only depends on the CMS at runtime.
 */

import { previewUrls } from "@moworks/preview-channel";
import { execa } from "execa";
import { setTimeout as sleep } from "node:timers/promises";

const healthUrl = new URL("/_health", previewUrls.cms);

/** Returns true if Strapi responds to its health check. */
async function isHealthy() {
  try {
    return (await fetch(healthUrl)).ok;
  } catch {
    return false;
  }
}

/**
 * Starts `strapi develop` and resolves once it responds on `/_health`.
 *
 *
 * This runs the binary directly, not through pnpm, that way so killing the child
 * stops  Strapi itself. `cleanup` kills it if this script exits first.
 *
 *
 * The CMS is expected to be a `devDependency` which ensures `turbo` will build it
 * before the website. It is resolved through the package graph with
 * `import.meta.resolve` so this script is immune to `mv`.
 */
async function startStrapi() {
  const cmsDir = new URL(".", import.meta.resolve("strapi-preview-plugin-example/package.json"));
  const strapi = execa("strapi", ["develop"], {
    cwd: cmsDir,
    preferLocal: true,
    stdio: "inherit",
    cleanup: true,
    forceKillAfterDelay: 10_000,
    reject: false,
  });

  const exitedEarly = strapi.then((result) => {
    throw new Error(`Strapi exited early (${result.exitCode})`);
  });
  // Strapi also exits when we stop it, after the race is over. Without a handler, that late rejection would crash.
  exitedEarly.catch(() => {});

  await Promise.race([
    exitedEarly,
    (async () => {
      for (let i = 0; i < 240; i++) {
        if (await isHealthy()) return;
        await sleep(500);
      }
      throw new Error(`Strapi did not answer ${healthUrl.href} in 120 s`);
    })(),
  ]);

  return async () => {
    strapi.kill();
    await strapi;
  };
}

const needsCms = process.env.CMS_PREVIEW !== "true" && !(await isHealthy());
const stopStrapi = needsCms ? await startStrapi() : undefined;
try {
  await execa("astro", ["build"], { preferLocal: true, stdio: "inherit" });
} finally {
  await stopStrapi?.();
}
