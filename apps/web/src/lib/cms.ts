import {
  type ArticleSummary,
  type Media,
  type Seo,
  global,
  globalEndpoint,
  routes,
  strapiResponse,
} from "@rs/contract";
import { STRAPI_URL } from "astro:env/server";
import { z } from "zod";

/** Strapi answered, but not with a 2xx status. */
export class CmsError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`Strapi request failed: ${status} ${url}`);
    this.name = "CmsError";
  }
}

/**
 * Fetch one Strapi REST endpoint and parse its `data` with a contract schema.
 * The endpoints apply their own default populate, so no query is needed for
 * the shape. A response that does not match the contract throws.
 */
async function get<Schema extends z.ZodType>(
  endpoint: string,
  schema: Schema,
  query: Record<string, string> = {},
): Promise<z.infer<Schema>> {
  const url = new URL(endpoint, STRAPI_URL);
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);

  const response = await fetch(url);
  if (!response.ok) throw new CmsError(url.href, response.status);
  const { data } = strapiResponse(z.unknown()).parse(await response.json());
  return schema.parse(data);
}

/**
 * Strapi answers 404 for a single type that has no entry yet. Read that as
 * "no content" so the page can respond 404 instead of failing.
 */
async function getSingle<Schema extends z.ZodType>(
  endpoint: string,
  schema: Schema,
): Promise<z.infer<Schema> | undefined> {
  try {
    return await get(endpoint, schema);
  } catch (error) {
    if (error instanceof CmsError && error.status === 404) return undefined;
    throw error;
  }
}

/** The layout cannot render without the site settings, so this one throws. */
export const getGlobal = () => get(globalEndpoint, global);

export const getHome = () => getSingle(routes.home.endpoint, routes.home.data);

export const getBlog = () => getSingle(routes.blog.endpoint, routes.blog.data);

export const getAbout = () =>
  getSingle(routes.about.endpoint, routes.about.data);

/** The article with this slug, or `undefined` when there is none. */
export async function getBlogPost(slug: string) {
  const params = routes.blogPost.params.parse({ slug });
  const posts = await get(routes.blogPost.endpoint, routes.blogPost.data, {
    "filters[slug][$eq]": params.slug,
  });
  return posts[0];
}

/** Every published article, newest first. */
export const getArticles = () =>
  get(routes.rss.endpoint, routes.rss.data, {
    sort: "publicationDate:desc",
    "pagination[pageSize]": "100",
  });

/**
 * Absolute URL of a Strapi media file. The local upload provider returns
 * paths relative to the Strapi server.
 */
export const mediaUrl = (media: Media): string =>
  new URL(media.url, STRAPI_URL).href;

/** Site path of an article, or `undefined` while it has no slug. */
export const articlePath = (article: ArticleSummary): string | undefined =>
  article.slug ? `/blog/${article.slug}/` : undefined;

/** Strapi `date` fields are calendar dates; read them as UTC midnight. */
export const toDate = (date: string): Date => new Date(`${date}T00:00:00Z`);

/** The page SEO, falling back to the site default, then the site text. */
export function resolveSeo(
  site: z.infer<typeof global>,
  seo: Seo | null,
  fallback: { title?: string | null; description?: string | null } = {},
) {
  const defaults = site.defaultSeo;
  const image = seo?.shareImage ?? defaults?.shareImage;
  return {
    title:
      seo?.metaTitle ?? fallback.title ?? defaults?.metaTitle ?? site.siteName,
    description:
      seo?.metaDescription ??
      fallback.description ??
      defaults?.metaDescription ??
      site.siteDescription,
    image: image ? mediaUrl(image) : undefined,
  };
}
