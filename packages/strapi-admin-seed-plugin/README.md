# @moworks/strapi-admin-seed-plugin

Seeds one Strapi super admin from environment variables so deployments don't
expose the open `POST /admin/register-admin` endpoint on a fresh deploy /
database. This also allows for e2e test suites.

## Usage

```ts
// config/plugins.ts
"admin-seed": {
  enabled: true,
  config: { mode: env("ADMIN_SEED_MODE", "once") },
},
```

```ts
// src/index.ts
async bootstrap({ strapi }) {
 // Run the admin seed after the bootstrap as the Super Admin role exists
 // only after the admin provider has been setup which is after plugin
 // lifecycles.
  await strapi.plugin("admin-seed").service("seed").run();
}
```

The seed must run from the app's `bootstrap()`. The Super Admin role is created
by the admin provider after plugin lifecycles, and the server is not yet
listening, so a failure stops the boot.

| Variable               | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `ADMIN_SEED_EMAIL`     | Super admin email. Unset: the seed is skipped.       |
| `ADMIN_SEED_PASSWORD`  | Password (8 chars to 72 bytes, lower, upper, digit). |
| `ADMIN_SEED_FIRSTNAME` | Default `Admin`                                      |
| `ADMIN_SEED_LASTNAME`  | Optional                                             |
| `ADMIN_SEED_MODE`      | `once` (default) or `always`                         |

## Modes

- `once`

  Runs once per database. If no admin exists, one is created. A marker is then
  written to the core store, so later boots do nothing even if every admin is
  deleted.

  Remove `ADMIN_SEED_PASSWORD` from the environment after the first boot and
  change the password in the admin UI.

  To re-seed, delete the row `plugin_admin-seed_seeded` from
  `strapi_core_store_settings`.

- `always`

  Every boot ensures the user exists, is active, is not blocked, has the Super
  Admin role, and has the env password. The env password is the source of truth
  so changing a password in the admin UI will be reverted on the next boot.

  > [!IMPORTANT]
  > This only fires at boot, it does **not** watch the user. Consider restarting
  > the pod on a schedule to catch drift.

A password that fails the policy stops the boot in both modes.

## API token

Set `ADMIN_SEED_API_TOKEN` to seed a content API token, so a consumer and the
CMS share one secret with no step in the admin UI. Unset: no token is seeded.

| Config         | Default                | Purpose                                         |
| -------------- | ---------------------- | ----------------------------------------------- |
| `apiTokenName` | `admin-seed`           | Name of the token in the admin UI               |
| `apiTokenType` | `read-only`            | `read-only` or `full-access`                    |
| `apiTokenEnv`  | `ADMIN_SEED_API_TOKEN` | Environment variable that holds the token value |

The token is reconciled on every boot in both modes: the environment is the
source of truth for the token with that name. The value must be at least 32
characters, e.g. `openssl rand -hex 64`. Strapi stores only its hash, so the
admin UI cannot show it.
