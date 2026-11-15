import {
  adminWidth,
  BELOW_DESKTOP,
  expect,
  frame,
  HOME_EDIT_VIEW,
  NARROW,
  openEditView,
  test,
  toggleButton,
  WIDE,
} from "./fixtures";

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
