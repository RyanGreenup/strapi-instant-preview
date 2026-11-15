# instant-preview

Instantly preview a draft in a split by autosaving

## Development

Install dependencies from the repository root with `pnpm install`. This package
uses the root workspace lockfile, shared `@rs/typescript-config`, and
`@rs/oxlint-config`.

Run these commands from `packages/instant-preview`:

```sh
pnpm run build
pnpm exec tsdown --watch
```

[tsdown] builds the admin entry into `dist/admin` as ESM (`index.mjs`) and
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

`check-types` uses the native TypeScript compiler (`tsgo`). `lint` runs
type-aware Oxlint and checks formatting with the shared Oxfmt configuration.
`test` runs Vitest and succeeds when no tests exist.

Use `pnpm run fix` for lint fixes and `pnpm run format` to apply formatting.

[tsdown]: https://tsdown.dev/
