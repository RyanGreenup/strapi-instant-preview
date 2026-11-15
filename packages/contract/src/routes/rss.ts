import { z } from "zod";

import { defineRoute } from "../route";
import { articleSummary } from "../strapi";

/** `src/pages/rss.xml.js`: one feed item per published article. */
export const rssRoute = defineRoute({
  path: "/rss.xml",
  endpoint: "/api/articles",
  params: z.object({}),
  data: z.array(articleSummary),
});

export type RssFeed = z.infer<typeof rssRoute.data>;
