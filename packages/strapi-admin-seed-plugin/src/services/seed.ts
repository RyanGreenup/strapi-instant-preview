import type { ApiTokenType, SeedConfig } from "../config";

interface AdminRole {
  id: number;
}

interface AdminUser {
  id: number;
  email: string;
  password: string;
  isActive: boolean;
  blocked: boolean | null;
  roles: AdminRole[];
}

interface UserService {
  exists: (attributes?: Record<string, unknown>) => Promise<boolean>;
  create: (attributes: Record<string, unknown>) => Promise<AdminUser>;
  createFirstAdmin?: (
    attributes: Record<string, unknown>,
  ) => Promise<AdminUser>;
  updateById: (
    id: number,
    attributes: Record<string, unknown>,
  ) => Promise<AdminUser>;
  findOneByEmail: (
    email: string,
    populate?: string[],
  ) => Promise<AdminUser | null>;
}

interface Query {
  findOne: (params: { where: Record<string, unknown> }) => Promise<unknown>;
  create: (params: { data: Record<string, unknown> }) => Promise<unknown>;
  update: (params: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<unknown>;
}

/**
 * The parts of Strapi this uses
 *
 * These are typed structurally so the plugin does not depend on `@strapi/strapi`.
 */
interface SeedStrapi {
  config: { get: (key: string) => unknown };
  service: (uid: string) => unknown;
  store: (scope: { type: string; name: string }) => {
    get: (params: { key: string }) => Promise<unknown>;
    set: (params: { key: string; value: unknown }) => Promise<unknown>;
  };
  db: { query: (uid: string) => Query };
  log: { info: (message: string) => void };
}

interface SeedAttributes {
  email: string;
  firstname: string;
  lastname: string | undefined;
  password: string;
}

interface SeedService {
  /**
   *  Seeds the super admin and the API token provided by the plugin config.
   *  
   *  Call it from the app's `bootstrap()` because  plugin lifecycles run before the
   *  admin roles exist and the HTTP server is not yet listening, so a failure would
   *  block boot.
   */
  run: () => Promise<void>;
}

const PLUGIN = "admin-seed";
const SEEDED_KEY = "seeded";

const API_TOKEN_MIN_LENGTH = 32;
const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores the bytes of a password after the first 72.
const PASSWORD_MAX_BYTES = 72;

/** Mirrors @strapi/admin's password validator, which the user service skips. */
function assertPasswordPolicy(password: string): void {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    Buffer.byteLength(password) > PASSWORD_MAX_BYTES ||
    !/[a-z]/u.test(password) ||
    !/[A-Z]/u.test(password) ||
    !/\d/u.test(password)
  ) {
    throw new Error(
      `${PLUGIN}: password must be 8 characters to 72 bytes with a lowercase letter, an uppercase letter and a digit`,
    );
  }
}

/** The seeded token is a bearer credential, so a guessable one is refused. */
function assertApiTokenPolicy(accessKey: string): void {
  if (accessKey.length < API_TOKEN_MIN_LENGTH) {
    throw new Error(
      `${PLUGIN}: API token must be at least ${API_TOKEN_MIN_LENGTH} characters`,
    );
  }
}

function users(strapi: SeedStrapi): UserService {
  return strapi.service("admin::user") as UserService;
}

async function superAdminRole(strapi: SeedStrapi): Promise<AdminRole> {
  const role = await (
    strapi.service("admin::role") as {
      getSuperAdmin: () => Promise<AdminRole>;
    }
  ).getSuperAdmin();
  return role;
}

async function createSuperAdmin(
  strapi: SeedStrapi,
  attributes: SeedAttributes,
): Promise<AdminUser> {
  const role = await superAdminRole(strapi);
  return users(strapi).create({
    ...attributes,
    isActive: true,
    registrationToken: null,
    roles: [role.id],
  });
}

async function seedOnce(
  strapi: SeedStrapi,
  attributes: SeedAttributes,
): Promise<void> {
  const store = strapi.store({ type: "plugin", name: PLUGIN });
  const seeded = await store.get({ key: SEEDED_KEY });
  if (seeded !== null && seeded !== undefined) {
    return;
  }
  if (!(await users(strapi).exists())) {
    try {
      // createFirstAdmin (Strapi >= 5.17) locks the role row so concurrent
      // instances create exactly one admin. Older releases fall back to create.
      await (users(strapi).createFirstAdmin?.({ ...attributes }) ??
        createSuperAdmin(strapi, attributes));
      strapi.log.info(`${PLUGIN}: created super admin ${attributes.email}`);
    } catch (error) {
      if (!(await users(strapi).exists())) {
        throw error;
      }
    }
  }
  await store.set({
    key: SEEDED_KEY,
    value: { at: new Date().toISOString() },
  });
}

/** Returns the changes that give `existing` the state of the seed. */
async function reconcilePatch(
  strapi: SeedStrapi,
  existing: AdminUser,
  password: string,
): Promise<Record<string, unknown>> {
  const role = await superAdminRole(strapi);
  const roleIds = existing.roles.map((r) => r.id);
  const patch: Record<string, unknown> = {};
  if (!existing.isActive) {
    patch["isActive"] = true;
  }
  if (existing.blocked === true) {
    patch["blocked"] = false;
  }
  if (!roleIds.includes(role.id)) {
    patch["roles"] = [...roleIds, role.id];
  }
  const passwordMatches = await (
    strapi.service("admin::auth") as {
      validatePassword: (password: string, hash: string) => Promise<boolean>;
    }
  ).validatePassword(password, existing.password);
  if (!passwordMatches) {
    patch["password"] = password;
  }
  return patch;
}

async function seedAlways(
  strapi: SeedStrapi,
  attributes: SeedAttributes,
): Promise<void> {
  const existing = await users(strapi).findOneByEmail(attributes.email, [
    "roles",
  ]);
  if (!existing) {
    await createSuperAdmin(strapi, attributes);
    strapi.log.info(`${PLUGIN}: created super admin ${attributes.email}`);
    return;
  }

  const patch = await reconcilePatch(strapi, existing, attributes.password);
  const changed = Object.keys(patch);
  if (changed.length > 0) {
    await users(strapi).updateById(existing.id, patch);
    strapi.log.info(
      `${PLUGIN}: reconciled super admin ${attributes.email} (${changed.join(", ")})`,
    );
  }
}

async function seedAdmin(
  strapi: SeedStrapi,
  { mode, email, firstname, lastname, passwordEnv }: SeedConfig,
): Promise<void> {
  const password = process.env[passwordEnv];
  if (
    email === undefined ||
    email === "" ||
    password === undefined ||
    password === ""
  ) {
    strapi.log.info(`${PLUGIN}: email or ${passwordEnv} is not set; skipped`);
    return;
  }
  assertPasswordPolicy(password);

  const attributes = {
    email: email.toLowerCase(),
    firstname,
    lastname,
    password,
  };
  await (mode === "once"
    ? seedOnce(strapi, attributes)
    : seedAlways(strapi, attributes));
}

/**
 * Seeds the API token
 *
 * Strapi only stores the hash, so the the Admin UI can't show it.
 *
 * This also checkes the API token matches the env var and has the appropriate type
 * based on the config provided to the plugin.
 */
async function seedApiToken(
  strapi: SeedStrapi,
  { apiTokenName: name, apiTokenType: type, apiTokenEnv }: SeedConfig,
): Promise<void> {
  const accessKey = process.env[apiTokenEnv];
  if (accessKey === undefined || accessKey === "") {
    return;
  }
  assertApiTokenPolicy(accessKey);

  const hash = (
    strapi.service("admin::api-token") as {
      hash: (accessKey: string) => string;
    }
  ).hash(accessKey);
  const tokens = strapi.db.query("admin::api-token");
  const data: { type: ApiTokenType } & Record<string, unknown> = {
    type,
    accessKey: hash,
    encryptedKey: null,
    lifespan: null,
    expiresAt: null,
  };
  const existing = (await tokens.findOne({ where: { name } })) as {
    id: number;
    type: string;
    accessKey: string;
  } | null;
  if (!existing) {
    await tokens.create({
      data: {
        ...data,
        name,
        kind: "content-api",
        description: `Seeded by ${PLUGIN} from ${apiTokenEnv}`,
      },
    });
    strapi.log.info(`${PLUGIN}: created API token '${name}'`);
  } else if (existing.accessKey !== hash || existing.type !== type) {
    await tokens.update({ where: { id: existing.id }, data });
    strapi.log.info(`${PLUGIN}: reconciled API token '${name}'`);
  }
}

/** The `seed` service of the plugin. */
function seed({ strapi }: { strapi: SeedStrapi }): SeedService {
  return {
    async run() {
      const config = strapi.config.get(`plugin::${PLUGIN}`) as SeedConfig;
      await seedAdmin(strapi, config);
      await seedApiToken(strapi, config);
    },
  };
}

export { assertApiTokenPolicy, assertPasswordPolicy, seed };
export type { SeedService, SeedStrapi };
