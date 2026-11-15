import {
  test as base,
  expect,
  type FrameLocator,
  type Locator,
  type Page,
} from "@playwright/test";

const CONTENT_MANAGER = "/admin/content-manager";
const HOME_EDIT_VIEW = `${CONTENT_MANAGER}/single-types/api::home.home`;
const ABOUT_EDIT_VIEW = `${CONTENT_MANAGER}/single-types/api::about.about`;
const ARTICLES = `${CONTENT_MANAGER}/collection-types/api::article.article`;
const PREVIEW_ROUTE = "/content-manager/preview/url/";
const PLUGIN_PREFIX = "instant-preview:";

// Strapi shows side panels beside the form from 1080px. The wide viewport
// leaves the form its side column; the narrow one forces the reflow.
const WIDE = { width: 1920, height: 1000 };
const NARROW = { width: 1200, height: 900 };
const BELOW_DESKTOP = { width: 900, height: 900 };

interface Lookup {
  status: number;
  url: string | undefined;
}

/** Width of the admin root, which the dock narrows to make room. */
const adminWidth = async (page: Page): Promise<number> =>
  page.evaluate(
    () => document.querySelector("#strapi")?.getBoundingClientRect().width ?? 0,
  );

const frame = (page: Page): Locator => page.locator('iframe[title="Preview"]');

const frameContent = (page: Page): FrameLocator =>
  page.frameLocator('iframe[title="Preview"]');

/**
 * Find the panel's preview toggle rather than the dock toolbar button.
 *
 * The dialog trigger distinguishes buttons that share the "Hide preview" label.
 */
const toggleButton = (page: Page): Locator =>
  page
    .getByRole("button", { name: /^(?:Show|Hide) preview$/u })
    .and(page.locator('[aria-haspopup="dialog"]'));

/**
 * Open a document's edit view and return the plugin's preview lookup.
 *
 * @param page The signed-in page.
 */
const openEditView = async (page: Page, path: string): Promise<Lookup> => {
  const lookup = page.waitForResponse((response) =>
    response.url().includes(PREVIEW_ROUTE),
  );
  await page.goto(path);
  const response = await lookup;
  const body: { data?: { url?: string } } = await response
    .json()
    .catch(() => ({}));
  return { status: response.status(), url: body.data?.url };
};

/**
 * Open a seeded article and return its preview lookup.
 *
 * Use an unchanged list cell so retries find the article after earlier saves.
 *
 * @param page The signed-in page.
 * @param cell The text of one list cell, such as the title or the slug.
 */
const openArticle = async (page: Page, cell: string): Promise<Lookup> => {
  await page.goto(ARTICLES);
  const lookup = page.waitForResponse((response) =>
    response.url().includes(PREVIEW_ROUTE),
  );
  await page.getByRole("gridcell", { name: cell, exact: true }).click();
  const response = await lookup;
  const body: { data?: { url?: string } } = await response.json();
  return { status: response.status(), url: body.data?.url };
};

/**
 * Fail each test if the plugin reports a broken Strapi assumption.
 */
const test = base.extend<{ pluginWarnings: string[] }>({
  pluginWarnings: [
    async ({ page }, use) => {
      const warnings: string[] = [];
      page.on("console", (message) => {
        if (message.text().startsWith(PLUGIN_PREFIX)) {
          warnings.push(message.text());
        }
      });
      await use(warnings);
      expect(
        warnings,
        "the plugin reported a broken Strapi assumption",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export {
  ABOUT_EDIT_VIEW,
  adminWidth,
  ARTICLES,
  BELOW_DESKTOP,
  expect,
  frame,
  frameContent,
  HOME_EDIT_VIEW,
  NARROW,
  openArticle,
  openEditView,
  test,
  toggleButton,
  WIDE,
};
export type { Lookup };
