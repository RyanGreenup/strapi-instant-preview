import { z } from "zod";

import { defineRoute } from "../route";
import { contentBlock, hero, seo } from "../strapi";

/** The `about` single type. */
export const aboutPage = z.object({
  title: z.string().nullable(),
  hero: hero.nullable(),
  blocks: z.array(contentBlock),
  seo: seo.nullable(),
});

/** `src/pages/about.astro` */
export const aboutRoute = defineRoute({
  path: "/about",
  endpoint: "/api/about",
  params: z.object({}),
  data: aboutPage,
});

export type AboutPage = z.infer<typeof aboutPage>;
