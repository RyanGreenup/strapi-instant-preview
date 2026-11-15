# instant-preview

Instantly preview a draft in a split by autosaving

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
