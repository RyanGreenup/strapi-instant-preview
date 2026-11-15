# Strapi Instant Preview

Live preview in the Strapi Content Manager, docked beside the edit form and
refreshed after saves or draft autosave.

Requires Strapi 5.62 or later.

## Install

Install the plugin in the Strapi app [^1496019]:

[^1496019]: https://www.npmjs.com/package/@ryangreenup/strapi-instant-preview

```sh
npm install @ryangreenup/strapi-instant-preview
```

The plugin uses the Strapi admin's own copies of React, `react-intl`,
`styled-components`, and the Strapi design system and icons. A standard Strapi 5
app already has these. If your package manager warns about missing peer
dependencies, install them:

```sh
npm install @strapi/design-system @strapi/icons react react-dom react-intl styled-components
```

Enable it in `config/plugins.ts`:

```ts
export default () => ({
  "instant-preview": {
    enabled: true,
  },
});
```

Then rebuild the admin (`npm run build`, or restart `npm run develop`).

## Preview configuration

The dock uses Strapi's native `preview` configuration in `config/admin.ts`. Any
handler works. For example:

```ts
export default ({ env }) => ({
  // ...
  preview: {
    enabled: true,
    config: {
      allowedOrigins: [env("CLIENT_URL")],
      async handler(uid, { documentId, locale, status }) {
        const params = new URLSearchParams({ uid, documentId, status });
        if (locale) params.set("locale", locale);
        return `${env("CLIENT_URL")}/preview?${params}`;
      },
    },
  },
});
```

A handler may return an absolute HTTP(S) URL or a path. A path resolves against
the admin. The live-preview panel does not show for unsaved documents, missing
or unparseable URLs, unsupported URL schemes, or a failed first lookup.

The preview page must allow framing by the admin origin (for example, a
`Content-Security-Policy: frame-ancestors` header that lists the admin URL).

To refresh the preview while editors type, pair this plugin with
[`@ryangreenup/strapi-draft-autosave`](https://www.npmjs.com/package/@ryangreenup/strapi-draft-autosave).

## Strapi assumptions

Strapi has no public API for docking a pane beside the editor, so the plugin
relies on these parts of the admin. If an assumption fails, the plugin degrades
gracefully instead of breaking the admin.

| Assumption                                                                    | Failure Mode                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Content Manager exposes `addEditViewSidePanel`                                | No live preview; warns                                 |
| `GET /content-manager/preview/url/:model` returns a URL                       | No live-preview panel                                  |
| The admin mounts in `#strapi`                                                 | The preview opens as an overlay, not a dock; warns     |
| `useIsDesktop` reports when panels like the _Save_ button are beside the form | Follows Strapi, so the dock and the panels stay paired |
| The edit view is a grid of two columns, panels last                           | Panels stay beside the form when the dock opens; warns |

Recheck the preview dock after every Strapi upgrade.

License: MIT.
