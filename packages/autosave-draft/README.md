# Autosave Draft Edits

Automatically saves draft edits, debounced during editing. This is used so the
instant preview has data to fetch.

Includes a revert button that restores the original draft from the browser's
`localstorage`.

## Build and development

Install dependencies with `pnpm install` at the repository root. This package
uses the root workspace catalog and shared TypeScript, Oxlint, and Oxfmt
configs.

Run these commands from `packages/autosave-draft`:

```sh
pnpm run build
pnpm exec tsdown --watch
```

[tsdown] builds the admin entry into `dist/admin` as ESM (`index.mjs`) and
CommonJS (`index.js`), with TypeScript declarations (`index.d.mts` and
`index.d.ts`). Translation JSON files are discovered through `import.meta.glob`
and included as lazy-loaded chunks.

## Checks

```sh
pnpm run check-types
pnpm run lint
pnpm run test
```

`test` runs Vitest and allows an empty test suite. Use `pnpm run fix` for
automatic lint fixes and `pnpm run format` to apply the shared formatting rules.

[tsdown]: https://tsdown.dev/
