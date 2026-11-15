# `@rs/oxlint-config`

## Overview

Shared Oxlint presets for TypeScript and Solid projects.

## Philosophy

Better to whitelist over time and enable more categories. As we build up a
ruleset and get tired then we can disable restriction, pedantic and style. This
offers the time to make considered decisions and build up a foundation rather
than waiving them off outright. Avoid `warn` as it's just ignorable
non-actionable noise.

## Installation

Install the config with Oxlint `^1.87.0`. For type-aware linting, also install
`oxlint-tsgolint` `>=7.0.2004`.

```sh
pnpm add -D @rs/oxlint-config oxlint oxlint-tsgolint
```

The package provides its Solid, SonarJS, and custom JavaScript plugins;
consumers needn't install them separately.

## Usage

Choose a complete preset. Add the integration presets that the project uses:

```ts
import { playwright, solid, tanstackRouter } from "@rs/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [solid, playwright, tanstackRouter],
  rules: {
    // Consumer overrides are applied after the shared preset.
    "no-console": "warn",
  },
});
```

Available presets:

- `base` contains the framework-independent TypeScript policy.
- `solid` contains `base` plus the Solid recommended rules and custom ref rule.
- `electron` contains exceptions for Electron main and renderer entry points.
- `playwright` contains exceptions for Playwright configuration and support
  files.
- `tanstackRouter` contains exceptions for TanStack Router route modules.

Run the workspace-local Oxlint binary:

```sh
pnpm exec oxlint --type-aware --type-check .
```

The recommended rules are generated against the package's pinned Oxlint version.
Avoid older globally installed Oxlint binaries because they may not recognize
every generated rule.

The lint-config package pins TypeScript 6 for the compiler API used by
typescript-eslint during rule generation, and builds its declarations with
`generator: "tsc"`. Plugin consumers use the workspace TypeScript 7 catalog and
tsgo declaration generation independently.

## Formatting

The package also provides the shared oxfmt config as `oxfmt.json`, exported at
`@rs/oxlint-config/oxfmt.json`. It sets `printWidth: 80`, `proseWrap: "always"`.
Install oxfmt alongside the config:

```sh
pnpm add -D oxfmt
```

Oxfmt does not have an `extends` key, and it only auto-discovers
`.oxfmtrc.json`, so the shared file must be passed explicitly with `-c`:

```sh
pnpm exec oxfmt -c node_modules/@rs/oxlint-config/oxfmt.json --write .
```

As package scripts:

```json
{
  "scripts": {
    "format": "oxfmt -c node_modules/@rs/oxlint-config/oxfmt.json --check .",
    "fix": "oxlint --fix .; oxfmt -c node_modules/@rs/oxlint-config/oxfmt.json ."
  }
}
```

To add per-project overrides, re-export the shared config from a local
`oxfmt.config.ts` and spread your changes on top:

```ts
import shared from "@rs/oxlint-config/oxfmt.json" with { type: "json" };

export default {
  ...shared,
  ignorePatterns: ["src/routeTree.gen.ts"],
};
```

That file still needs `-c` because oxfmt does not discover `oxfmt.config.ts` on
its own:

```sh
pnpm exec oxfmt -c oxfmt.config.ts --write .
```

The `$schema` in `oxfmt.json` is relative to this package, so editor schema
hints only resolve only inside this repo. It has no Impact on formatting output
but is a bit annoying.
