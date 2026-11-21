/**
 * Builds the site with a running CMS.
 *
 * Not used yet: `web` is server rendered (SSR), so it reads Strapi only at
 * request time and `pnpm build` runs `astro build` directly. Wire this in as the
 * `build` script if pages become prerendered (SSG), because a static build reads
 * Strapi over the REST API while it renders.
 *
 * If Strapi already answers at STRAPI_URL (for example under `turbo dev`), the
 * build uses it. Otherwise this starts `strapi develop`, waits for `/_health`,
 * builds, and stops the server.
 *
 * Turbo can't do this with `with` or a health-check task, because it stops a
 * `with` task when the task that started it ends, not when its dependents end.
 */

import { execa } from "execa";
import { setTimeout as sleep } from "node:timers/promises";

const strapiUrl = process.env["STRAPI_URL"];
if (!strapiUrl) {
  throw new Error(
    "STRAPI_URL is not set. Run through mise, which loads .env.yaml.",
  );
}
const healthUrl = new URL("/_health", strapiUrl);

/**
 * The Strapi app, found by its path in the repo.
 *
 * It is not a devDependency of `web`, so the package graph can't find it: the
 * Strapi app already depends on `web` for its e2e suite, and turbo rejects the
 * cycle. For the same reason, `web#build` can't depend on the Strapi app's
 * build. If `web` moves to SSG, reverse that edge first: drop `web` from the
 * Strapi app's devDependencies and give the e2e suite another way to build it.
 */
const cmsDir = new URL(
  "../../strapi-instant-preview-example/",
  import.meta.url,
);

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
 * This runs the binary directly, not through pnpm, so killing the child stops
 * Strapi itself. `cleanup` kills it if this script exits first.
 */
async function startStrapi() {
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
  // Strapi also exits when we stop it, after the race is over. Without a
  // handler, that late rejection would crash the script.
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

const stopStrapi = (await isHealthy()) ? undefined : await startStrapi();
try {
  await execa("astro", ["build"], { preferLocal: true, stdio: "inherit" });
} finally {
  await stopStrapi?.();
}
