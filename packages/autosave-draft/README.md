# Draft Autosave

`@rs/strapi-draft-autosave` saves existing drafts while editors work in Strapi's
Content Manager. Its Autosave side panel provides a browser-wide toggle, save
status, and a per-tab revert snapshot. It does not add a menu page or publish
content.

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

The delay defaults to 500 milliseconds and must be finite and at least 100. The
authenticated `GET /draft-autosave/config` endpoint supplies it to the admin
panel. Restart Strapi after changing server configuration.

The [example app](../../apps/strapi-instant-preview-example/) already enables
the plugin. From the repository root:

```sh
pnpm install
pnpm --dir packages/autosave-draft build
pnpm --dir packages/strapi-admin-seed-plugin build
mise exec -- pnpm --dir apps/strapi-instant-preview-example develop
```

Restart Strapi after rebuilding the plugin; the admin bundle is assembled at
startup.

## Behavior

- Autosave is on by default. `localStorage` remembers the toggle across entries.
- Only existing entries with Draft & Publish, an active Draft tab, and update
  permission qualify. New entries need their first manual save. Content types
  without drafts have no Autosave panel.
- Any form change restarts the delay, including component edits, reorderings,
  relations, and media pickers. Validation failures prevent a request without
  displaying field errors. A later edit retries failed or invalid saves.
- Saves use Content Manager's update route without a notification toast. The
  response updates its cached document rather than refetching, preserving
  dynamic-zone focus. Edits made during the request remain in the form and
  autosave next. Manual Save and Publish remain available.
- Leaving during the delay does not flush pending edits. Strapi's normal
  unsaved-change confirmation still applies.

### Revert

Before the first autosave attempt, the plugin snapshots the form's initial
values in `sessionStorage`, keyed by model, document, and locale. The snapshot
survives page reloads in that tab. Publishing or a successful revert clears it.

Revert restores and saves plain fields, components, and dynamic zones. It keeps
current top-level media and relations. Within components, media is restored and
existing instances retain their current relation state. Recreating a deleted
component does not restore its relation links.

## Structure

- `admin/src/index.ts` registers the side panel and lazy translations.
- `components/` renders the toggle, status, and revert confirmation.
- `hooks/useAutosave.ts` composes the autosave lifecycle.
- `hooks/useAutosaveContext.ts` reads Strapi's document, form, and permissions.
- `hooks/useAutosaveSession.ts` owns save state and snapshot lifetime.
- `hooks/useAutosaveSave.ts` validates and serializes save requests.
- `hooks/useAutosaveLifecycle.ts` schedules saves, reconciles form reloads, and
  restores snapshots.
- `services/saveDraft.ts` sends updates and patches Content Manager's cache.
- `logic/` contains data transforms, comparison, snapshot storage, and their
  behavioral tests.
- `server/src/index.ts` validates configuration and serves the admin endpoint.

## Checks and compatibility

Run from this package:

```sh
pnpm run build
pnpm run check-types
pnpm run lint
pnpm run test
```

The shared tsdown configuration emits ESM/CommonJS admin bundles and a CommonJS
server bundle under `dist/`, with declarations. TypeScript, Oxlint, and Oxfmt
use the workspace configs. No separate package lockfile or Strapi SDK build is
needed.

Verified against Strapi 5.62. The plugin relies on `unstable_useDocument`, the
Content Manager update route, and its internal `getDocument` cache arguments. If
a cache entry cannot be updated, the plugin refetches; dynamic-zone fields can
lose focus during that fallback. Recheck editing, in-flight changes, and revert
behavior after upgrading Strapi.

Other inherited limits:

- Autosave runs only while Strapi mounts its side panel. On narrow screens,
  closing the panel drawer can stop autosave.
- Conditionally hidden fields are sent as held by the form; Strapi's manual Save
  action filters them.
- Publishing while an autosave is already in flight can leave the entry marked
  Modified even when its content matches the published version.

License: MIT.
