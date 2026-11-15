/**
 * Default populate queries for the content types the web app reads. Each one
 * returns the shape that the matching route contract in `@ryangreenup/contract`
 * expects. Strapi 5 populates nothing by default.
 */

const seo = { populate: { shareImage: true } } as const;

const hero = { populate: { image: true } } as const;

/** The components allowed in every `blocks` dynamic zone. */
const contentBlocks = {
  "shared.media": { populate: { file: true } },
  "shared.slider": { populate: { files: true } },
  "shared.quote": { populate: "*" },
  "shared.rich-text": { populate: "*" },
  "shared.link": { populate: "*" },
} as const;

const articleGrid = {
  populate: { articles: { populate: { cover: true } } },
} as const;

export const populate = {
  global: {
    favicon: true,
    defaultSeo: seo,
    header: { populate: { homeLink: true, navigation: true } },
    footer: true,
    socialLinks: true,
  },
  home: {
    hero,
    seo,
    blocks: {
      on: { ...contentBlocks, "sections.article-grid": articleGrid },
    },
  },
  blog: {
    articleGrid,
    seo,
  },
  about: {
    hero,
    seo,
    blocks: { on: contentBlocks },
  },
  article: {
    cover: true,
    author: { populate: { avatar: true } },
    category: true,
    blocks: { on: contentBlocks },
    seo,
  },
} as const;

/**
 * Route middleware config that applies a default populate query.
 *
 * @param query - One of the queries in `populate`.
 * @returns The middleware entry for a core router's route config.
 */
export const withPopulate = (query: object) => ({
  middlewares: [{ name: "global::populate", config: { populate: query } }],
});
