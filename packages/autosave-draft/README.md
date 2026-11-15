# Autosave Draft Edits

Automatically saves draft edits, debounced during editing. This is used so the instant preview has
data to fetch.

Includes a revert button that restores the original draft from the browsers `localstorage`.

## Build

Run these commands from `packages/instant-preview`:

```sh
pnpm run build
pnpm run watch
```

[tsdown] builds the admin entry into `dist/admin` as ESM (`index.mjs`) and CommonJS (`index.js`),
with TypeScript declarations.

Translation JSON files are discovered through `import.meta.glob` and included as lazy-loaded chunks.

[tsdown]: https://tsdown.dev/
