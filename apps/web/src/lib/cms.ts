import type { PreviewParams } from "@rs/strapi-preview-helpers/server";

import {
  type ArticleSummary,
  type Media,
  type Seo,
  global,
  globalEndpoint,
  routes,
  strapiResponse,
} from "@rs/contract";
import { STRAPI_ADMIN_SEED_API_TOKEN, STRAPI_PUBLIC_URL, STRAPI_URL } from "astro:env/server";
import { z } from "zod";

/**
 * Define Strapi's browser-facing address.
 *
 * `STRAPI_URL` serves requests and may be internal to a cluster / Fargate etc.
 */
export const strapiPublicUrl = STRAPI_PUBLIC_URL ?? STRAPI_URL;

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
 * Fetch a Strapi REST endpoint and parse its `data` with a contract schema.
 *
 * Endpoints apply their default populate configuration. Responses that violate the contract throw an error.
 *
 * All reads use the server-only token because Strapi blocks anonymous access.
 *
 * Reads default to published content unless a verified preview requests drafts.
 */
async function get<Schema extends z.ZodType>(
  endpoint: string,
  schema: Schema,
  query: Record<string, string> = {},
  status: PreviewParams["status"] = "published",
): Promise<z.infer<Schema>> {
  const url = new URL(endpoint, STRAPI_URL);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  // Set last, so no query can override the status.
  url.searchParams.set("status", status);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${STRAPI_ADMIN_SEED_API_TOKEN}` },
  });
  if (!response.ok) throw new CmsError(url.href, response.status);
  const { data } = strapiResponse(z.unknown()).parse(await response.json());
  return schema.parse(data);
}

/**
 * Read a single type, or return `undefined` for Strapi's missing-entry 404.
 *
 * Accept `preview` only from `verifyPreview` and use its signed locale and status.
 */
async function getSingle<Schema extends z.ZodType>(
  endpoint: string,
  schema: Schema,
  preview?: PreviewParams,
): Promise<z.infer<Schema> | undefined> {
  const query: Record<string, string> = preview?.locale ? { locale: preview.locale } : {};
  try {
    return await get(endpoint, schema, query, preview?.status);
  } catch (error) {
    if (error instanceof CmsError && error.status === 404) return undefined;
    throw error;
  }
}

/** The layout cannot render without the site settings, so this one throws. */
export const getGlobal = () => get(globalEndpoint, global);

export const getHome = (preview?: PreviewParams) =>
  getSingle(routes.home.endpoint, routes.home.data, preview);

export const getBlog = (preview?: PreviewParams) =>
  getSingle(routes.blog.endpoint, routes.blog.data, preview);

export const getAbout = () => getSingle(routes.about.endpoint, routes.about.data);

/** The article with this slug, or `undefined` when there is none. */
export async function getBlogPost(slug: string) {
  const params = routes.blogPost.params.parse({ slug });
  const posts = await get(routes.blogPost.endpoint, routes.blogPost.data, {
    "filters[slug][$eq]": params.slug,
  });
  return posts[0];
}

/**
 * Fetch the article named by a verified preview, with its signed status.
 *
 * Accept `preview` only from `verifyPreview`.
 */
export async function getPreviewBlogPost(preview: PreviewParams) {
  const query: Record<string, string> = {
    "filters[documentId][$eq]": preview.documentId,
  };
  if (preview.locale) query.locale = preview.locale;
  const posts = await get(routes.blogPost.endpoint, routes.blogPost.data, query, preview.status);
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
export const mediaUrl = (media: Media): string => new URL(media.url, strapiPublicUrl).href;

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
    title: seo?.metaTitle ?? fallback.title ?? defaults?.metaTitle ?? site.siteName,
    description:
      seo?.metaDescription ??
      fallback.description ??
      defaults?.metaDescription ??
      site.siteDescription,
    image: image ? mediaUrl(image) : undefined,
  };
}
