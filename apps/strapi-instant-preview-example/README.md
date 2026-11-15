# 🚀 Getting started with Strapi

Strapi comes with a full featured
[Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets
you scaffold and manage your project in seconds.

## Seeded local admin and API token

The app uses the workspace `strapi-admin-seed-plugin`. Its seed service runs
from the app bootstrap, after Strapi creates the admin roles.

Run from the repository root:

```sh
pnpm --dir packages/strapi-admin-seed-plugin build
pnpm --dir packages/autosave-draft build
mise exec -- pnpm --dir apps/strapi-instant-preview-example develop
```

`mise.toml` loads the [SOPS]-encrypted [^@78c5bb5] root `.env.yaml`. Decryption
requires access to the [age] [^@6a84079] key configured in `.sops.yaml`, on a
fresh clone create a fresh `.env.yaml`. Manage credentials with [SOPS], not the
app's plaintext `.env`:

[^@6a84079]:
    GitHub - FiloSottile/age: A simple, modern and secure encryption tool (and
    Go library) with small explicit keys, no config options, and UNIX-style
    composability. (n.d.). GitHub. Retrieved November 15, 2026, from
    https://github.com/filosottile/age

[age]: https://github.com/filosottile/age

[^@78c5bb5]:
    GitHub - getsops/sops: Simple and flexible tool for managing secrets.
    (n.d.). GitHub. Retrieved November 15, 2026, from
    https://github.com/getsops/sops

[SOPS]: https://github.com/getsops/sops

```sh
mise exec -- sops edit .env.yaml
```

The default `once` mode creates the first Super Admin only when no admin exists
and records a database marker and wont reset an existing admin's password. The
`admin-seed` read-only content API token is reconciled with its encrypted
environment value on every boot. `STRAPI_ADMIN_SEED_MODE=always` also reconciles
the admin on every boot; use it only when that behavior is intended.

## Draft autosave

The example enables the workspace
[`@rs/strapi-draft-autosave`](../../packages/autosave-draft/) plugin. Open an
existing article's Draft tab, edit a field, and pause for 1/2 a second.. The
Autosave panel shows the saved time and offers a revert to the original draft.
New entries require an initial save before autosave starts.

Set `DRAFT_AUTOSAVE_DEBOUNCE_MS` to change the delay (minimum 100 milliseconds),
then restart Strapi. Publishing clears the per-tab revert snapshot. Autosave
never publishes content.

## Web content components

The content model maps the UI in [`apps/web`](../web/) to editable components.

| Web candidate                                               | Strapi model                                                                              | Where to edit                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Site header and navigation                                  | `layout.header`, repeatable `shared.link`                                                 | Global -> header                                        |
| Header/footer social links                                  | Repeatable `shared.social-link` with platform, accessible label, URL, and new-tab setting | Global -> socialLinks                                   |
| Footer copyright                                            | `layout.footer`; the frontend computes the current year                                   | Global -> footer                                        |
| Page metadata and sharing image                             | Existing `shared.seo`, extended with optional canonical URL                               | Global -> defaultSeo; Home, Blog, About, Article -> seo |
| Home introduction and About hero                            | `shared.hero` with title, description, image, and optional dates                          | Home / About -> hero                                    |
| Blog grid and article cards                                 | `sections.article-grid` with ordered article relations and featured-first presentation    | Blog -> articleGrid; Home -> blocks                     |
| Article title, image, and dates                             | Existing Article title/description/cover plus publicationDate and updatedDate             | Article                                                 |
| Prose, headings, lists, tables, code, and inline formatting | Existing Markdown `shared.rich-text`                                                      | Home / About / Article -> blocks                        |
| Images and other media                                      | Existing `shared.media`; image collections use existing `shared.slider`                   | Home / About / Article -> blocks                        |
| Blockquotes                                                 | Existing `shared.quote`                                                                   | Home / About / Article -> blocks                        |
| Embedded MDX link                                           | `shared.link`; arbitrary JavaScript handlers are not CMS content                          | Home / About / Article -> blocks                        |

### `develop`

Start your Strapi application with autoReload enabled.
[Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled.
[Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel.
[Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including
[Strapi Cloud](https://cloud.strapi.io). Browse the
[deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment)
to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi
  documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by
  the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing
  articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product
  updates, new features and general improvements.

Feel free to check out the
[Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and
contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community
  including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find
  answers, show your Strapi project and get feedback or just talk with other
  Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of
  awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
