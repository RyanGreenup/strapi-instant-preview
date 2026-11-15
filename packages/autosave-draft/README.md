# Draft Autosave

This plugin saves existing drafts while editors work in Strapi's Content
Manager. It has a browser-wide toggle, save status, and a per-tab revert
snapshot. It doesn't add a menu page or publish content.

Because every change is saved to the draft, a server-rendered preview page can
show the latest edits by fetching the draft from Strapi. This suits sites such
as Astro, where islands are not used throughout, live previews of dynamic zone
blocks matter, and the CMS API stays the single source of truth. If your
frontend renders on the client (Next.js, Nuxt, SvelteKit, TanStack Start, or
Astro islands), passing the unsaved form content to the preview through an
`iframe` message channel may suit you better.

Requires Strapi 5.62 or later, with Draft & Publish enabled on the content types
you want to autosave.

## Install

Install the plugin in the Strapi app [^1496019]:

[^1496019]: https://www.npmjs.com/package/@ryangreenup/strapi-instant-preview

```sh
npm install @ryangreenup/strapi-draft-autosave
```

The plugin uses the Strapi admin's own copies of React, `react-intl`,
`styled-components`, the Strapi design system, and the Content Manager. A
standard Strapi 5 app already has these. If your package manager warns about
missing peer dependencies, install them:

```sh
npm install @strapi/content-manager @strapi/design-system react react-dom react-intl styled-components
```

Enable it in `config/plugins.ts`:

```ts
export default ({ env }) => ({
  "draft-autosave": {
    enabled: true,
    config: {
      debounceMs: env.int("DRAFT_AUTOSAVE_DEBOUNCE_MS", 500),
    },
  },
});
```

Then rebuild the admin (`npm run build`, or restart `npm run develop`).

`debounceMs` is the quiet period after a form change before the draft saves. It
defaults to 500 and must be at least 100. The admin panel reads it from the
authenticated `GET /draft-autosave/config` endpoint.

To show the saved draft beside the editor, pair this plugin with
[`@ryangreenup/strapi-instant-preview`](https://www.npmjs.com/package/@ryangreenup/strapi-instant-preview).

## Behavior

- Autosave is on by default. `localStorage` remembers the toggle across entries.
- Only existing entries with Draft & Publish, an active Draft tab, and update
  permission qualify. New entries need an initial save.
- Any form change restarts the delay, including component edits, reorderings,
  relations, and media pickers.
- Saves use Content Manager's update route without a notification toast.
- Request data follows Save's relation conversion and conditional-field
  filtering, including nested components and dynamic zones. Hidden fields are
  omitted, and backend-managed `visible: false` fields are preserved.
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

## Compatibility

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
