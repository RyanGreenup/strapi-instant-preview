import {
  adminWidth,
  BELOW_DESKTOP,
  expect,
  frame,
  HOME_EDIT_VIEW,
  isArticleSave,
  NARROW,
  openArticle,
  openEditView,
  test,
  toggleButton,
  WIDE,
} from "./fixtures";

// Seeded in data/data.json. Each saving test in the suite uses a separate article.
const STATUS_ARTICLE_SLUG = "the-internet-s-own-boy";
const FOCUS_ARTICLE_SLUG = "what-s-inside-a-black-hole";

// Test names identify Strapi admin assumptions that upgrades can break.
// The fixture also fails tests if the plugin warns about a broken assumption.

test.describe("at desktop width", () => {
  test.use({ viewport: WIDE });

  test("the preview URL route answers with a URL", async ({ page }) => {
    const { status, url } = await openEditView(page, HOME_EDIT_VIEW);

    expect(status).toBe(200);
    expect(url).toBeTruthy();
  });

  test("the side panel API mounts the panel and the dock", async ({ page }) => {
    await openEditView(page, HOME_EDIT_VIEW);

    await expect(toggleButton(page)).toHaveText("Hide preview");
    await expect(frame(page)).toBeVisible();
  });

  test("the admin root narrows for the dock and widens again", async ({
    page,
  }) => {
    await openEditView(page, HOME_EDIT_VIEW);
    await expect(frame(page)).toBeVisible();

    // The dock defaults to 40% of the viewport.
    await expect
      .poll(async () => adminWidth(page))
      .toBeCloseTo(WIDE.width * 0.6, -1);

    await toggleButton(page).click();
    await expect.poll(async () => adminWidth(page)).toBe(WIDE.width);
  });

  test("an autosave marks a published document as modified", async ({
    page,
  }) => {
    // The autosave plugin patches Strapi's cached document instead of refetching it.
    await openArticle(page, STATUS_ARTICLE_SLUG);
    const saved = page.waitForResponse((response) =>
      isArticleSave(response.request()),
    );
    await page
      .getByRole("textbox", { name: "description" })
      .fill(`Autosaved ${Date.now()}`);
    expect((await saved).status()).toBe(200);

    await expect(page.getByText("Modified", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish", exact: true }),
    ).toBeEnabled();
  });

  test("an autosave keeps focus in a dynamic zone field", async ({ page }) => {
    // Refetching the document disables dynamic zone fields, which drops focus.
    await openArticle(page, FOCUS_ARTICLE_SLUG);
    await page.getByRole("button", { name: /Quote/u }).first().click();
    const quoteTitle = page.locator('input[name="blocks.1.title"]');
    const saved = page.waitForResponse((response) =>
      isArticleSave(response.request()),
    );
    await quoteTitle.fill(`Quoted ${Date.now()}`);
    expect((await saved).status()).toBe(200);

    // The badge changes once the save's response reaches the cached document.
    await expect(page.getByText("Modified", { exact: true })).toBeVisible();
    await expect(quoteTitle).toBeFocused();
    await expect(quoteTitle).toBeEnabled();
  });
});

test.describe("at a narrow desktop width", () => {
  test.use({ viewport: NARROW });

  test("a narrow editor reflows the side panels above the form", async ({
    page,
  }) => {
    await openEditView(page, HOME_EDIT_VIEW);
    await expect(frame(page)).toBeVisible();

    const grid = page.locator('[data-preview-reflow="grid"]');
    const panels = page.locator('[data-preview-reflow="panels"]');
    await expect(grid).toHaveCount(1);
    await expect(panels).toHaveCount(1);

    // The reflow styles put the panels first and at the full grid width.
    const [gridBox, panelsBox, formBox] = await Promise.all([
      grid.boundingBox(),
      panels.boundingBox(),
      grid.locator("> :first-child").boundingBox(),
    ]);
    expect(panelsBox?.width).toBeCloseTo(gridBox?.width ?? 0, 0);
    expect(panelsBox?.y).toBeLessThan(formBox?.y ?? 0);

    await toggleButton(page).click();
    await expect(grid).toHaveCount(0);
  });
});

test.describe("below the desktop breakpoint", () => {
  test.use({ viewport: BELOW_DESKTOP });

  test("the dock reserves no editor space", async ({ page }) => {
    // Strapi moves the panels into its drawer here, so the dock must not
    // reserve editor space.
    await openEditView(page, HOME_EDIT_VIEW);

    await expect(page.locator("#strapi")).toBeAttached();
    expect(await adminWidth(page)).toBe(BELOW_DESKTOP.width);
    await expect(page.locator("[data-preview-reflow]")).toHaveCount(0);
  });
});
