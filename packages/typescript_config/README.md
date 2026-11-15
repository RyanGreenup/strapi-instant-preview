# @rs/typescript-config

Shared `tsconfig` presets. Extend the preset for your runtime, then override
package-specific file paths and types.

## Usage

Add the config package to the consuming package's `devDependencies`:

```json
{
  "devDependencies": {
    "@rs/typescript-config": "workspace:*"
  }
}
```

Extend it from that package's `tsconfig.json`:

```json
{
  "extends": "@rs/typescript-config/node-app.json",
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

Node presets require `@types/node` in the consuming package. The base preset
loads `@tsconfig/strictest` through this package's runtime dependency.

## Presets

| Preset                | For                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `base.json`           | Base config with strictest checks. Type-checks without emitting assuming the package is build with e.g. `tsdown`. |
| `node-app.json`       | Node CLI and library packages built with tsdown. Inherits the base.                                               |
| `node-app-cjs.json`   | Node packages that need NodeNext module resolution and CommonJS-compatible import syntax (Strapi stuff mostly).   |
| `solid-vite-app.json` | SolidJS apps built by Vite.                                                                                       |
| `nextjs.json`         | Next.js apps.                                                                                                     |
| `strapi.json`         | Strapi servers. Standalone strict CommonJS configuration. Does not inherit the no-emit base.                      |

## Strictness and build behavior

`base.json` extends `@tsconfig/strictest/tsconfig.json`. Its checks include
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

The base and its derived presets also enable:

- `verbatimModuleSyntax`: use `import type` and `export type` for type-only
  symbols. The CommonJS preset disables this flag to permit regular import
  syntax.
- `erasableSyntaxOnly`: avoid enums, parameter properties, and namespaces that
  generate runtime code.
- `isolatedModules`: each file must support independent transpilation.
- `isolatedDeclarations`: add explicit types to exported declarations where
  needed so declaration generation can process files independently.
- `declaration` and `declarationMap`: configure declaration output and source
  navigation when an emitting build tool uses these settings.
- `noEmit`: `tsgo` only type-checks; tsdown or the framework build tool emits
  JavaScript and any declarations. Setting `declaration: true` alone does not
  override `noEmit`.

## Strapi usage

Strapi needs its own emitting configuration. Override the preset's relative
paths in the Strapi app's `tsconfig.json` so output and source discovery refer
to the app, not this config package:

```json
{
  "extends": "@rs/typescript-config/strapi.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["./", "./**/*.ts", "./**/*.js", "src/**/*.json"],
  "exclude": [
    "node_modules/",
    "build/",
    "dist/",
    ".cache/",
    ".tmp/",
    ".strapi/",
    "src/admin/",
    "**/*.test.*",
    "src/plugins/**"
  ]
}
```

### Plugins built with tsdown

`instant-preview`, `preview-helpers`, `autosave-draft`, and
`strapi-admin-seed-plugin` extend `base.json` rather than the Strapi application
preset: tsgo checks their types, and tsdown emits their JavaScript and
declarations. Admin plugins add React JSX settings locally; the server plugin
emits CommonJS for Strapi's loader.

This package's `lint`, `format`, and `fix` scripts use the shared oxfmt
configuration in `packages/oxlint-config`.
