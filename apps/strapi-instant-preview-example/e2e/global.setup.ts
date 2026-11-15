import { expect, test as setup } from "@playwright/test";

import { AUTH_FILE } from "./env";
import { HOME_EDIT_VIEW } from "./fixtures";

const EMAIL = process.env["STRAPI_ADMIN_SEED_EMAIL"];
const PASSWORD = process.env["STRAPI_ADMIN_SEED_PASSWORD"];

// Sign in once to avoid Strapi's login rate limit.
// Each test starts a fresh browser context from the saved session.
setup("sign in to the admin", async ({ page }) => {
  // Fail rather than skip: a skipped suite would pass `pnpm check` untested.
  expect(
    EMAIL && PASSWORD,
    "STRAPI_ADMIN_SEED_EMAIL and STRAPI_ADMIN_SEED_PASSWORD must be set; run through mise",
  ).toBeTruthy();

  await page.goto("/admin/auth/login");
  await page.getByLabel(/email/iu).fill(EMAIL ?? "");
  await page.getByLabel(/^password/iu).fill(PASSWORD ?? "");
  await page.getByRole("button", { name: /login/iu }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/"));

  // Skip the guided tour so its overlay cannot block Content Manager clicks.
  // The saved session preserves this choice in localStorage.
  await page.goto(HOME_EDIT_VIEW);
  const tour = page.getByRole("dialog").filter({
    has: page.locator("#guided-tour-title"),
  });
  const skip = tour.getByRole("button", { name: "Skip" });
  const hasTour = await skip
    .waitFor({ timeout: 5000 })
    .then(() => true)
    // No tour in this Strapi version or for this admin.
    .catch(() => false);
  if (hasTour) {
    await skip.click();
    await expect(tour).toBeHidden();
  }

  await page.context().storageState({ path: AUTH_FILE });
});
