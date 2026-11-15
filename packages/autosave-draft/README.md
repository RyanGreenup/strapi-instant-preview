# Draft Autosave

This plugin saves existing drafts while editors work in Strapi's Content
Manager. It has browser-wide toggle, save status, and a per-tab revert snapshot.
It doesn't add a menu page or publish content.

This allows server side rendered html to get a live preview, unlike the Strapi
live preview plugin which relies on client side rendering. If you're using Astro
islands, Tanstack Start, Svelte Kit, Next.js, Nuxt etc. it may be better to to
pass the form content via `useForm` via an iframe channel. This plugin is for
Astro where islands are not necessarily used throughout, previewing dynamic zone
blocks in real time is important and getting a single source of truth for the
cms data flow is valued.

## Setup

Add this workspace package to the Strapi app's dependencies:

```json
{
  "@rs/strapi-draft-autosave": "workspace:*"
}
```

Enable it in `config/plugins.ts`:

```ts
"draft-autosave": {
  enabled: true,
  config: {
    debounceMs: env.int("DRAFT_AUTOSAVE_DEBOUNCE_MS", 500),
  },
},
```

The delay defaults to 500 milliseconds > 100 ms. The authenticated
`GET /draft-autosave/config` endpoint supplies it to the admin panel.

The [example app](../../apps/strapi-instant-preview-example/) enables the plugin
as an example.

From the repository root:

```sh
pnpm install
pnpm --dir packages/autosave-draft build
pnpm --dir packages/strapi-admin-seed-plugin build
mise exec -- pnpm --dir apps/strapi-instant-preview-example develop
```

## Behavior

- Autosave is on by default. `localStorage` remembers the toggle across entries.
- Only existing entries with Draft & Publish, an active Draft tab, and update
  permission qualify. New entries need an initial save.
- Any form change restarts the delay, including component edits, reorderings,
  relations, and media pickers.
- Saves use Content Manager's update route without a notification toast.
- Request data follows Save's relation conversion and conditional-field
  filtering, including nested components and dynamic zones, hidden fields are
  omitted and backend-managed `visible: false` fields are preserved.
- Existing non-default-locale updates keep shared fields, as Strapi Save does.

### Revert

Before the first autosave attempt, the plugin snapshots the form's initial
values in `sessionStorage`, keyed by model, document, and locale. The snapshot
persists across page reloads in that tab. Publishing or a successful revert
clears it.

Revert restores and saves plain fields, components, and dynamic zones. It keeps
current top-level media and relations. Within components, media is restored and
existing instances retain their current relation state. Recreating a deleted
component does not restore its relation links.

## Checks and compatibility

Run from this package:

```sh
pnpm run build
pnpm run check-types
pnpm run lint
pnpm run test
```

Verified against Strapi 5.62. The plugin uses Content Manager's public
`buildValidParams` export to share the edit view's query parameters and cached
document. It also relies on `unstable_useDocument`, the Content Manager update
route, and its internal `getDocument` cache arguments. If a cache entry cannot
be updated, the plugin refetches; dynamic-zone fields can lose focus during that
fallback. Recheck editing, in-flight changes, and revert behavior after
upgrading Strapi.

If Content Manager's `addEditViewSidePanel` API is missing or not callable,
bootstrap logs a compatibility warning and disables only autosave. The remaining
admin plugins can still load.

Other limits:

- Autosave runs only while Strapi mounts its side panel. On narrow screens,
  closing the panel drawer can stop autosave.
- Publishing while an autosave is already in flight can leave the entry marked
  Modified even when its content matches the published version.

License: MIT.
