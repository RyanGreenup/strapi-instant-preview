type SeedMode = "once" | "always";

type ApiTokenType = "read-only" | "full-access";

interface SeedConfig {
  mode: SeedMode;
  email: string | undefined;
  firstname: string;
  lastname: string | undefined;
  /** Name of the environment variable read at run time for the password. */
  passwordEnv: string;
  /** Name that the seeded API token has in the admin UI. */
  apiTokenName: string;
  apiTokenType: ApiTokenType;
  /** Name of the environment variable read at run time for the API token. */
  apiTokenEnv: string;
}

type Env = (key: string, fallback?: string) => string | undefined;

const MODES: readonly SeedMode[] = ["once", "always"];
const API_TOKEN_TYPES: readonly ApiTokenType[] = ["read-only", "full-access"];

const config: {
  default: (params: { env: Env }) => SeedConfig;
  validator: (value: SeedConfig) => void;
} = {
  default: ({ env }) => ({
    mode: "once",
    email: env("STRAPI_ADMIN_SEED_EMAIL"),
    firstname: env("STRAPI_ADMIN_SEED_FIRSTNAME") ?? "Admin",
    lastname: env("STRAPI_ADMIN_SEED_LASTNAME"),
    passwordEnv: "STRAPI_ADMIN_SEED_PASSWORD",
    apiTokenName: "admin-seed",
    apiTokenType: "read-only",
    apiTokenEnv: "STRAPI_ADMIN_SEED_API_TOKEN",
  }),
  validator(value) {
    if (!MODES.includes(value.mode)) {
      throw new Error(
        `mode must be one of ${MODES.join(", ")}, got '${value.mode}'`,
      );
    }
    if (!API_TOKEN_TYPES.includes(value.apiTokenType)) {
      throw new Error(
        `apiTokenType must be one of ${API_TOKEN_TYPES.join(", ")}, got '${value.apiTokenType}'`,
      );
    }
  },
};

export { config };
export type { ApiTokenType, SeedConfig, SeedMode };
