import { z } from "zod";

import { defineRoute } from "../route";
import { articleSummary, contentBlock, media, seo } from "../strapi";

/** The `author` an article belongs to. */
export const author = z.object({
  documentId: z.string(),
  name: z.string().nullable(),
  avatar: media.nullable(),
});

/** The `category` an article belongs to. */
export const category = z.object({
  documentId: z.string(),
  name: z.string().nullable(),
  slug: z.string().nullable(),
});

/** One `article`, with its body, author and category. */
export const blogPost = articleSummary.extend({
  author: author.nullable(),
  category: category.nullable(),
  blocks: z.array(contentBlock),
  seo: seo.nullable(),
});

/**
 * `src/pages/blog/[...slug].astro`. Strapi has no single-article endpoint by
 * slug, so the route filters the collection and takes the first match.
 */
export const blogPostRoute = defineRoute({
  path: "/blog/[...slug]",
  endpoint: "/api/articles",
  params: z.object({ slug: z.string().min(1) }),
  data: z.array(blogPost).max(1),
});

export type Author = z.infer<typeof author>;
export type Category = z.infer<typeof category>;
export type BlogPost = z.infer<typeof blogPost>;
