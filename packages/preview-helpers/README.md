# preview-helpers

Signed, expiring preview links and the preview-page iframe bridge for Strapi's
native preview. Both are optional companions to
[`@rs/strapi-instant-preview`](../instant-preview/README.md) and have no
dependencies: install this package in the Strapi app for `./server`, and in the
frontend for `./server` and `./client`. Routing, draft fetching, and rendering
stay in your apps.

## Signed preview links: `@rs/strapi-preview-helpers/server`

In Strapi, `createPreviewConfig` returns the native `preview` configuration. You
supply the frontend URL, a signing secret, and the route for each document:

```ts
import { createPreviewConfig } from "@rs/strapi-preview-helpers/server";

// Within the admin configuration factory in config/admin.ts:
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
    return article ? `/preview/blog/${article.slug}` : undefined;
  },
}),
```

Returning no path means no preview for that document. A missing URL, or a secret
shorter than 32 characters, throws when Strapi loads the configuration. Generate
the secret with `openssl rand -hex 32`.

On the frontend server, verify the request before fetching the draft with your
own content API credentials:

```ts
import {
  previewHeaders,
  verifyPreviewUrl,
} from "@rs/strapi-preview-helpers/server";

const preview = verifyPreviewUrl(request.url, process.env.PREVIEW_SECRET);
if (!preview) return new Response("Forbidden", { status: 403 });
// preview is { documentId, locale, status }; locale is "" when absent.
```

`previewHeaders(strapiUrl)` returns response headers that disable caching,
referrers, and indexing, and allow framing only by the Strapi admin.

A link is a temporary bearer credential for one path, document, locale, and
status. It expires on a clock-hour boundary 1 to 2 hours after signing, so it
stays identical across autosaves within the hour. Keep query strings out of
access logs. Use a dedicated secret known only to the two servers; rotating it
revokes existing links. `signPreviewUrl` is exported for custom handlers.

The signed query is `documentId`, `locale`, `status`, `expires` (Unix seconds),
in that order, followed by `signature`: the lowercase hexadecimal HMAC-SHA256 of
`pathname + "?" + query` before `signature` is added. Verification rejects
missing, duplicate, unexpected, reordered, tampered, and expired parameters.

The host is not signed, so a link verifies on every frontend that holds the
secret. To serve previews from one deployment only, such as a container beside
the CMS while the public site is static, give the secret to that deployment
alone and point `frontendUrl` at it. Skip verification, and refuse the request,
on a deployment that has no secret: `verifyPreviewUrl` throws without one.

Verification uses the path and query exactly as the frontend receives them. A
proxy or CDN that re-encodes the path, adds or removes a trailing slash, or
reorders the query turns every link into a 403; one that ignores `no-store` can
cache a draft. Test preview on the real hosting.

## Preview page bridge: `@rs/strapi-preview-helpers/client`

On preview pages, render a marker carrying the Strapi admin origin and start the
bridge once in the browser:

```html
<span data-strapi-preview-origin="https://cms.example.com" hidden></span>
```

```ts
import { startPreviewBridge } from "@rs/strapi-preview-helpers/client";

startPreviewBridge({
  // Re-render through your client router; omit to reload the page.
  refresh: () => router.refresh(),
});
```

The bridge accepts `strapiUpdate` only from the parent window at that origin,
calls `refresh`, and restores the scroll position. It forwards an iframe-focused
`mod+alt+P` to the admin as `{ type: "strapiPreviewToggle" }`. The marker is
read on every event, so the bridge idles on pages without one. Pass
`adminOrigin` instead of rendering a marker if every page is a preview page.
`refresh` receives a `restoreScroll` callback for routers that reset scrolling
before they settle. The function returns a `stop` callback.

With Astro's `ClientRouter`, refresh the path and query only, and restore the
scroll position inside `astro:after-swap`:

```ts
import { startPreviewBridge } from "@rs/strapi-preview-helpers/client";
import { navigate } from "astro:transitions/client";

startPreviewBridge({
  refresh: async (restoreScroll) => {
    // The router scrolls to the top before this event; restoring later flashes.
    document.addEventListener("astro:after-swap", restoreScroll, {
      once: true,
    });
    try {
      await navigate(location.pathname + location.search, {
        history: "replace",
      });
    } finally {
      document.removeEventListener("astro:after-swap", restoreScroll);
    }
  },
});
```

Do not pass `location.href`. If it has a `#hash`, the router treats the
navigation as a same-page link: it scrolls, fetches nothing, and the update is
lost.

## Development

Run these commands from `packages/preview-helpers`:

```sh
pnpm run build
pnpm run check-types
pnpm run lint
pnpm run test
```

[tsdown] builds the `client` and `server` entries into `dist/<entry>` as ESM
(`index.mjs`) and CommonJS (`index.js`), with matching TypeScript declarations.
Only `server` uses `node:crypto`; do not import it from browser code.

[tsdown]: https://tsdown.dev/
