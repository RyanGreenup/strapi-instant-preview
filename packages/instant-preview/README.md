# Strapi Instant Preview

Live preview in the Strapi Content Manager, refreshed after saves or draft
autosave.

## Host setup

Install `@rs/strapi-instant-preview` and its peer dependencies in the Strapi
app, enable `"instant-preview": { enabled: true }` in `config/plugins.ts`, then
rebuild the admin.

The dock works with any Strapi native `preview` configuration in
`config/admin.ts`. A handler may return an absolute HTTP(S) URL or a path, which
resolves against the admin. Unsaved documents, missing or unparseable URLs,
unsupported URL schemes, and a failed first lookup will not show the
live-preview panel.

Signed, expiring preview links and the preview-page `iframe` bridge are in the
optional [`@rs/strapi-preview-helpers`](../preview-helpers/README.md) package.
Hosts with their own handler, cookies, or draft sessions don't need it.

## Strapi assumptions

Strapi has no public API for docking a pane beside the editor, so the plugin
relies on these parts of the admin. Each assumption should gracefully degrades
instead of breaking the admin

| Assumption                                                                    | Failure Mode                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Content Manager exposes `addEditViewSidePanel`                                | No live preview; warns                                 |
| `GET /content-manager/preview/url/:model` returns a URL                       | No live-preview panel                                  |
| The admin mounts in `#strapi`                                                 | The preview opens as an overlay, not a dock; warns     |
| `useIsDesktop` reports when panels like the _Save_ button are beside the form | Follows Strapi, so the dock and the panels stay paired |
| The edit view is a grid of two columns, panels last                           | Panels stay beside the form when the dock opens; warns |

The canary in `apps/strapi-instant-preview-example/e2e` checks these against a
Strapi build. Run it after every Strapi upgrade:

```sh
pnpm turbo run test:e2e --filter strapi-instant-preview-example
```

It signs in with `STRAPI_ADMIN_SEED_EMAIL` and `STRAPI_ADMIN_SEED_PASSWORD`, and
skips when they are not set.

## Build

Run these commands from `packages/instant-preview`:

```sh
pnpm run build
pnpm exec tsdown --watch
```

[tsdown] builds the `admin` entry into `dist/admin` as ESM (`index.mjs`) and
CommonJS (`index.js`), with matching TypeScript declarations (`index.d.mts` and
`index.d.ts`). Both the build and type check use the package's root
`tsconfig.json`.

Translation JSON files are discovered through `import.meta.glob` and included as
lazy-loaded chunks.

## Checks

```sh
pnpm run check-types
pnpm run lint
pnpm run test
```

[tsdown]: https://tsdown.dev/
