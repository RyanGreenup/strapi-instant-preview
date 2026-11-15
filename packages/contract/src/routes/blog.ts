import { z } from "zod";

import { defineRoute } from "../route";
import { articleGrid, seo } from "../strapi";

/** The `blog` single type: the heading and grid of the blog index. */
export const blogPage = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  articleGrid: articleGrid.nullable(),
  seo: seo.nullable(),
});

/** `src/pages/blog/index.astro` */
export const blogRoute = defineRoute({
  path: "/blog",
  endpoint: "/api/blog",
  params: z.object({}),
  data: blogPage,
});

export type BlogPage = z.infer<typeof blogPage>;
