import {
  ABOUT_EDIT_VIEW,
  adminWidth,
  ARTICLE_API,
  ARTICLES,
  BELOW_DESKTOP,
  expect,
  frame,
  frameContent,
  HOME_EDIT_VIEW,
  isArticleSave,
  openArticle,
  openEditView,
  test,
  toggleButton,
  WIDE,
} from "./fixtures";

const TYPING_ARTICLE_SLUG = "a-bug-is-becoming-a-meme-on-the-internet";

// Fresh browser contexts reset plugin preferences: the desktop dock opens at 40%.

// Seeded in data/data.json. Each saving test uses a separate article and an unchanged lookup field.
const LIVE_ARTICLE_SLUG = "this-shrimp-is-awesome";
const SLUG_ARTICLE = "Beautiful picture";

test.describe("at desktop width", () => {
  test.use({ viewport: WIDE });

  test("an autosaved edit appears in the preview without reloading it", async ({
    page,
  }) => {
    const { url } = await openArticle(page, LIVE_ARTICLE_SLUG);
    expect(url).toContain(`/preview/blog/${LIVE_ARTICLE_SLUG}`);
    await expect(frame(page)).toHaveAttribute("src", url ?? "");
    const preview = frameContent(page);
    const heading = preview.getByRole("heading", { level: 1 });
    const titleField = page.getByRole("textbox", { name: "title" });
    await expect(heading).toHaveText((await titleField.inputValue()) || "");

    // The seeded article starts with a published preview.
    // Its first autosaved edit switches the preview to a draft link.
    const firstTitle = `Draft title ${Date.now()}`;
    await titleField.fill(firstTitle);
    await expect(heading).toHaveText(firstTitle);
    await expect(frame(page)).toHaveAttribute("src", /[?&]status=draft&/u);
    const draftUrl = (await frame(page).getAttribute("src")) ?? "";

    // Later edits refresh the open preview in place. A full reload of the
    // preview page would lose this marker.
    const previewFrame = page.frame({ url: /\/preview\/blog\// });
    expect(previewFrame).not.toBeNull();
    await previewFrame?.evaluate(() => {
      Object.assign(globalThis, { e2eMarker: true });
    });

    const title = `Live title ${Date.now()}`;
    await titleField.fill(title);

    await expect(heading).toHaveText(title);
    await expect(frame(page)).toHaveAttribute("src", draftUrl);
    expect(
      await previewFrame?.evaluate(() => "e2eMarker" in globalThis),
      "the preview reloaded instead of refreshing in place",
    ).toBe(true);
  });

  test("a changed slug moves the preview to the new URL", async ({ page }) => {
    const { url } = await openArticle(page, SLUG_ARTICLE);
    const slugField = page.getByRole("textbox", { name: "slug" });
    expect(url).toContain(`/preview/blog/${await slugField.inputValue()}?`);

    const slug = `moved-${Date.now()}`;
    await slugField.fill(slug);

    await expect(frame(page)).toHaveAttribute(
      "src",
      new RegExp(`/preview/blog/${slug}\\?`, "u"),
    );
    await expect(
      frameContent(page).getByRole("heading", { level: 1 }),
    ).toHaveText(SLUG_ARTICLE);
  });

  test("text typed during an autosave survives the save", async ({ page }) => {
    await openArticle(page, TYPING_ARTICLE_SLUG);
    const titleField = page.getByRole("textbox", { name: "title" });
    const descriptionField = page.getByRole("textbox", { name: "description" });

    // Hold the first save open so the next edit happens during the request.
    let release = (): void => {
      /* Replaced when the first save arrives. */
    };
    let held = 0;
    await page.route(`**${ARTICLE_API}**`, async (route) => {
      if (isArticleSave(route.request())) {
        held += 1;
        if (held === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      }
      await route.continue();
    });

    const title = `Held title ${Date.now()}`;
    const firstSave = page.waitForRequest(isArticleSave);
    await titleField.fill(title);
    await firstSave;

    const description = `Typed mid-save ${Date.now()}`;
    await descriptionField.fill(description);
    const firstResponse = page.waitForResponse((response) =>
      isArticleSave(response.request()),
    );
    const secondSave = page.waitForRequest(
      (request) =>
        isArticleSave(request) &&
        (request.postData() ?? "").includes(description),
    );
    release();
    expect((await firstResponse).status()).toBe(200);

    // The form adopts the saved document but keeps the newer edit, then saves it.
    await expect(page.getByText("Modified", { exact: true })).toBeVisible();
    await expect(titleField).toHaveValue(title);
    await expect(descriptionField).toHaveValue(description);
    await secondSave;
    await expect(descriptionField).toHaveValue(description);
  });

  test("documents without a preview show no panel", async ({ page }) => {
    // The example's preview handler has no page for About.
    const { url } = await openEditView(page, ABOUT_EDIT_VIEW);
    expect(url).toBeFalsy();
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
    await expect(page.getByText("Live preview")).toHaveCount(0);
    await expect(frame(page)).toHaveCount(0);

    // An unsaved document has nothing to preview yet.
    await page.goto(`${ARTICLES}/create`);
    await expect(
      page.getByRole("heading", { name: "Create an entry" }),
    ).toBeVisible();
    await expect(page.getByText("Live preview")).toHaveCount(0);
    await expect(frame(page)).toHaveCount(0);
  });

  test("the dock remembers whether it is open and how wide it is", async ({
    page,
  }) => {
    await openEditView(page, HOME_EDIT_VIEW);
    await expect(frame(page)).toBeVisible();

    await toggleButton(page).click();
    await expect(frame(page)).toHaveCount(0);
    await page.reload();
    await expect(toggleButton(page)).toHaveText("Show preview");
    await expect(frame(page)).toHaveCount(0);

    await toggleButton(page).click();
    await expect(frame(page)).toBeVisible();
    // Wait for the opening slide to finish at the default 40% dock.
    const before = WIDE.width * 0.6;
    await expect.poll(async () => adminWidth(page)).toBeCloseTo(before, -1);

    // Drag the divider 300px left to widen the dock.
    const handle = page.getByRole("separator", { name: "Resize preview" });
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 150, y, { steps: 5 });
    await page.mouse.move(x - 300, y, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(async () => adminWidth(page))
      .toBeCloseTo(before - 300, -1);
    const dragged = await adminWidth(page);

    await page.reload();
    await expect(frame(page)).toBeVisible();
    await expect.poll(async () => adminWidth(page)).toBeCloseTo(dragged, -1);
  });

  test("the shortcut toggles the dock from the editor and the preview", async ({
    page,
  }) => {
    await openEditView(page, HOME_EDIT_VIEW);
    await expect(frame(page)).toBeVisible();

    await page.keyboard.press("Control+Alt+KeyP");
    await expect(frame(page)).toHaveCount(0);
    await page.keyboard.press("Control+Alt+KeyP");
    await expect(frame(page)).toBeVisible();

    // Keys pressed in the preview reach the admin through its bridge.
    await frameContent(page).locator("body").press("Control+Alt+KeyP");
    await expect(frame(page)).toHaveCount(0);
  });

  test("preview pages accept only signed links and are not cacheable", async ({
    page,
    request,
  }) => {
    const { url } = await openEditView(page, HOME_EDIT_VIEW);
    expect(url).toBeTruthy();
    const signed = new URL(url ?? "");
    const adminOrigin = new URL(page.url()).origin;

    const assertHeaders = (headers: Record<string, string>): void => {
      expect(headers["content-security-policy"]).toBe(
        `frame-ancestors ${adminOrigin}`,
      );
      expect(headers["cache-control"]).toBe("private,no-store");
      expect(headers["x-robots-tag"]).toBe("noindex,nofollow");
      expect(headers["referrer-policy"]).toBe("no-referrer");
    };

    const valid = await request.get(signed.href);
    expect(valid.status()).toBe(200);
    assertHeaders(valid.headers());

    const unsigned = await request.get(`${signed.origin}${signed.pathname}`);
    expect(unsigned.status()).toBe(403);
    assertHeaders(unsigned.headers());

    // A link signed for one draft cannot be pointed at another.
    const tampered = new URL(signed);
    tampered.searchParams.set("documentId", "someone-else");
    expect((await request.get(tampered.href)).status()).toBe(403);
  });
});

test.describe("below the desktop breakpoint", () => {
  test.use({ viewport: BELOW_DESKTOP });

  test("the preview is a modal overlay that starts closed", async ({
    page,
  }) => {
    const { url } = await openEditView(page, HOME_EDIT_VIEW);
    // Strapi moves the side panels into a drawer under its action bar here.
    await page.getByRole("button", { name: "Open more actions" }).click();
    await expect(toggleButton(page)).toHaveText("Show preview");
    await expect(frame(page)).toHaveCount(0);

    await toggleButton(page).click();
    const overlay = page.getByRole("dialog", { name: url ?? "" });
    await expect(overlay).toBeVisible();
    await expect(frame(page)).toBeVisible();
    // The overlay covers the editor rather than narrowing it.
    expect(await adminWidth(page)).toBe(BELOW_DESKTOP.width);
    // Focus stays inside the modal.
    await page.keyboard.press("Tab");
    await expect(overlay.locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    await expect(frame(page)).toHaveCount(0);
  });
});
