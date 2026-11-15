import path from "node:path";

// The e2e servers default to the dev ports plus one, so the suite can run
// while the dev servers are up. E2E_STRAPI_PORT and E2E_WEB_PORT override them.
const port = (override: string, dev: string, fallback: number): number =>
  Number(process.env[override] ?? Number(process.env[dev] ?? fallback) + 1);

const STRAPI_PORT = port("E2E_STRAPI_PORT", "STRAPI_PORT", 1337);
const WEB_PORT = port("E2E_WEB_PORT", "WEB_PORT", 4321);

const STRAPI_URL = `http://localhost:${STRAPI_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

/** The signed-in admin session. It holds a session cookie; never commit it. */
const AUTH_FILE = path.join(__dirname, "../.tmp/e2e/auth.json");

/** Environment for both servers: e2e ports and a throwaway SQLite database. */
const serverEnv: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ),
  STRAPI_PORT: String(STRAPI_PORT),
  STRAPI_URL,
  WEB_PORT: String(WEB_PORT),
  WEB_URL,
  DATABASE_CLIENT: "sqlite",
  DATABASE_FILENAME: ".tmp/e2e/data.db",
};

export { AUTH_FILE, STRAPI_URL, WEB_URL, serverEnv };
