# Strapi Instant Preview

Strapi plugin for instant preview during editing. Autosaves drafts and shows the
preview panel on the side so edits can be viewed in real-time.

## Usage

### Try it Locally

This will start a Strapi with the plugin installed and a corresponding web app
ready to go:

```sh
pnpm install
turbo build
turbo dev
```

### Add the plugin to Strapi

The example uses Strapi 5.62, a server-rendered frontend, and the draft autosave
plugin.

#### 1. Install and enable the plugins

In your Strapi application:

```sh
pnpm install @ryangreenup/strapi-instant-preview @ryangreenup/strapi-draft-autosave @ryangreenup/strapi-preview-helpers
```

Add the plugins to your existing `config/plugins.ts`:

```ts
export default ({ env }) => ({
  "instant-preview": { enabled: true },
  "draft-autosave": {
    enabled: true,
    config: {
      debounceMs: env.int("DRAFT_AUTOSAVE_DEBOUNCE_MS", 500),
    },
  },
});
```

Autosave is optional, but it lets the preview update while an editor types.

Its debounce defaults to 500 ms and must be at least 100 ms. Enable Draft &
Publish on content types that should autosave.

> [!IMPORTANT]
> Don't use the autosave with the paid Content History feature and make sure
> that webhooks target **published** not draft content.

#### 2. Configure preview URLs

1. Set `WEB_URL` to the frontend preview server's URL, as seen by editors'
   browsers.
2. Set `PREVIEW_SECRET` to a dedicated secret (>= 32 characters)
   - Generate one with `openssl rand -hex 32`.
3. Give the same secret to Strapi and the preview server
   - keep it out of browser code and use SOPS if it's tracked.

Add `preview` to your existing `config/admin.ts` configuration. This example
maps an article content type to a frontend route; replace the UID and path with
your own:

```ts
import { createPreviewConfig } from "@ryangreenup/strapi-preview-helpers/server";

// Inside the existing config factory's returned object:
preview: createPreviewConfig({
  frontendUrl: env("WEB_URL"),
  secret: env("PREVIEW_SECRET"),
  resolvePath: async (uid, { documentId, locale }) => {
    if (uid !== "api::article.article") return undefined;

    const article = await strapi.documents(uid).findOne({
      documentId,
      locale,
      status: "draft",
      fields: ["slug"],
    });
    return article
      ? `/preview/blog/${encodeURIComponent(article.slug || documentId)}`
      : undefined;
  },
}),
```

Return `undefined` for content types or documents without a preview.

Add `resolvePath` branches for your other routes.

The example app also maps its home and blog single types to `/preview/` and
`/preview/blog/`.

The helper configures Strapi's native preview and signs the document ID, locale,
status, and path. You can instead provide your own native preview configuration.

Restart `npm run develop` or rebuild the admin with `npm run build` and restart
Strapi.

#### 3. Implement the frontend preview

Install `@ryangreenup/strapi-preview-helpers` in the frontend too. Implement
server-rendered routes matching the paths returned above and for each preview
request:

1. Verify the URL with `verifyPreviewUrl(request.url, secret)` from
   `@ryangreenup/strapi-preview-helpers/server`.
   1. Reject invalid or expired requests with HTTP 403 before fetching drafts.
   2. If the secret is absent, reject the request instead of calling the
      verifier.
2. Use the `documentId`, `locale`, and `status` to fetch the requested content
   from Strapi with a server-only API token.
   1. Grant the token read access to the content the page needs, do not expose
      it to the browser or grant public roles draft access.
   2. A read token can access drafts, so ordinary public routes must explicitly
      request published content.
3. Apply `previewHeaders(strapiAdminOrigin)` to the response.
   - These headers disable caching, referrers, and indexing, and allow the
     Strapi admin origin to put the page in an `iframe` frame the page.
   - Exclude canonical and Open Graph URLS from the preview render.
4. On the preview page, render a marker containing the browser-facing Strapi
   admin origin and start the client bridge:

   ```html
   <span data-strapi-preview-origin="https://cms.example.com" hidden></span>
   ```

   ```ts
   import { startPreviewBridge } from "@ryangreenup/strapi-preview-helpers/client";

   startPreviewBridge();
   ```

   The bridge listens for updates from that parent and reloads the page.

   Provide a `refresh` callback to use your client router instead and preserve
   the `iframe` document, see the
   [helper documentation](packages/preview-helpers/README.md#preview-page-bridge-ryangreenupstrapi-preview-helpersclient)
   for the Astro example and scroll restoration.

> [!TIP]
> Preview URLs are temporary bearer credentials. Restrict access to the preview
> server, keep URL query strings out of logs, and don't share the signing secret
> with a public deployment (atleast one that should not serve previews).
>
> Configure any proxies to keep the signed path and query exactly and respect
> the no-cache headers.

#### 4. Check the editor workflow

Open an entry in Content Manager, save it once if it is new, and edit its Draft
tab with autosave enabled. The side panel should show the frontend and update
after the draft saves. Use Ctrl/Command+Alt+P to toggle the panel.

For a complete implementation, see the
[Strapi example](apps/strapi-instant-preview-example/README.md#live-article-preview)
and its [Astro frontend](apps/web/README.md#strapi-article-preview). The
[autosave documentation](packages/autosave-draft/README.md#behavior) describes
its eligibility and revert behavior.
