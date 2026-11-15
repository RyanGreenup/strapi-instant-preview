# Strapi Instant Preview

Strapi plugin for instant preview during editing.

## Workspace checks

Use Node.js 24 or later and the pnpm version declared in `package.json`.

```sh
pnpm install
pnpm check
```

`pnpm check` validates package scripts, checks the frozen lockfile and
dependency catalogs, then runs builds, lint, type checks, tests, and any
package-defined end-to-end tests through Turbo. Finally, dependency-cruiser
checks module boundaries and dependency declarations.

Other root commands:

- `pnpm build`, `pnpm lint`, `pnpm check-types`, and `pnpm test` run workspace
  tasks.
- `pnpm format` formats packages; `pnpm fix` runs lint fixes and formatting.
- `pnpm deps:lint` checks catalog consistency; `pnpm deps:fix` fixes
  declarations.
- `pnpm deps:cruise` checks package dependency graphs.

Turbo caches `dist/**` from builds. Checks wait for dependency builds, including
the shared lint configuration; transit tasks propagate source changes through
packages without build scripts. The lint-config package owns generation and
caching of its recommended rules.

TypeScript 7 is used for plugin checks and declarations. Tools that require the
TypeScript compiler API use TypeScript 6 through the `typescript-api` catalog.
Peer dependency ranges remain independent of build-time catalog versions.

The `prepare` script installs Lefthook in a Git checkout. Pre-commit checks
staged whitespace and formats staged files; pre-push runs `pnpm check`.
