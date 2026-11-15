# Astro Starter Kit: Blog

```sh
pnpm create astro@latest -- --template blog
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and Open Graph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support

## Strapi article preview

The server-rendered routes under `/preview` cover the home page (`/preview/`),
the blog index (`/preview/blog/`), and articles (`/preview/blog/[...slug]`).
Each renders the same component as its public page. Rich-text Markdown is
sanitized before it is rendered. Strapi grants no anonymous access, so every CMS
request goes through `get()` in `src/lib/cms.ts`, which sends the server-only
API token and requests published content unless it is given a verified preview.

Run the app through mise so the server receives `STRAPI_URL`,
`STRAPI_ADMIN_SEED_API_TOKEN`, `PREVIEW_SECRET`, `WEB_URL`, and `WEB_PORT`. The
API token must have read-only access to all content the site reads and stays on
the server. `PREVIEW_SECRET` verifies preview links; configure the same value in
the Strapi host.

### A separate preview deployment

Previews can run in their own deployment, such as a container beside the CMS,
while the public site is a different deployment or a static build:

- Set `PREVIEW_SECRET` only on the preview deployment. A deployment without it
  answers every `/preview` link with 403 and never requests a draft. A static
  build has no server, so it has no preview routes at all.
- In Strapi, set `WEB_URL` to the preview deployment's address as the editor's
  browser reaches it. Strapi signs links for that address only and allows only
  that origin in the preview iframe.
- `STRAPI_URL` is the address the server reads from, and may be internal, such
  as `http://strapi:1337`. Then set `STRAPI_PUBLIC_URL` to the address browsers
  use. Media URLs and the admin origin allowed to frame a preview come from it.
  It defaults to `STRAPI_URL`.

A signed link names a path, not a host, so it verifies on any deployment that
holds the secret. Keep the secret off the public deployment. Editors' browsers
load the preview in an iframe, so they must be able to reach the preview
deployment; put it behind the same network controls as the admin.

A Strapi API token cannot be limited to published content. The public
deployment's token can read drafts; it does not because `get()` asks for
published content unless `verifyPreview` returned a document.

Signing, verification, response headers, and the iframe bridge come from
[`@ryangreenup/strapi-preview-helpers`](../../packages/preview-helpers/README.md),
which documents the signed URL contract. This app owns the routes, the draft
fetches in `src/lib/cms.ts`, and the router refresh in
`src/components/PreviewBridge.astro`. Invalid or expired links return 403 before
any draft is fetched; missing articles return 404. Drafts do not need a slug or
complete optional content.

Preview URLs grant temporary bearer access: do not share or log them, and redact
their query strings in proxy and access logs. Responses disable caching,
referrers, and indexing. Preview pages omit canonical and Open Graph URLs, and
allow framing only by the origin of `STRAPI_PUBLIC_URL`, or of `STRAPI_URL` when
it is unset.

The preview accepts `strapiUpdate` messages only from its Strapi parent and
refreshes through Astro's `ClientRouter`, without reloading the iframe document,
adding history entries, or resetting its scroll position. Refresh targets omit
the URL fragment so hash links cannot bypass fetching; scroll restoration is
instant even when the site enables smooth scrolling. The bridge remains active
across router swaps, but does nothing when the preview marker is absent.
Ctrl/Command+Alt+P (without Shift) uses the physical P key and forwards
`strapiPreviewToggle` to that same origin.

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── content/
│   ├── layouts/
│   └── pages/
├── astro.config.mjs
├── README.md
├── package.json
└── tsconfig.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page
is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put
any Astro/React/Vue/Svelte/Preact components.

The `src/content/` directory contains "collections" of related Markdown and MDX
documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and
type-check your frontmatter using an optional schema. See
[Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/)
to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                | Action                                           |
| :--------------------- | :----------------------------------------------- |
| `pnpm install`         | Installs dependencies                            |
| `pnpm dev`             | Starts local dev server at `localhost:4321`      |
| `pnpm build`           | Build your production site to `./dist/`          |
| `pnpm preview`         | Preview your build locally, before deploying     |
| `pnpm astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `pnpm astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Check out [our documentation](https://docs.astro.build) or jump into our
[Discord server](https://astro.build/chat).

## Credit

This theme is based off of the lovely
[Bear Blog](https://github.com/HermanMartinus/bearblog/).
