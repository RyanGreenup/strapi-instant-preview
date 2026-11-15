import { z } from "zod";

import { defineRoute } from "../route";
import { articleGridBlock, contentBlock, hero, seo } from "../strapi";

/** The `home` single type. The home page also allows an article grid. */
export const homePage = z.object({
  hero: hero.nullable(),
  blocks: z.array(
    z.discriminatedUnion("__component", [
      ...contentBlock.options,
      articleGridBlock,
    ]),
  ),
  seo: seo.nullable(),
});

/** `src/pages/index.astro` */
export const homeRoute = defineRoute({
  path: "/",
  endpoint: "/api/home",
  params: z.object({}),
  data: homePage,
});

export type HomePage = z.infer<typeof homePage>;
