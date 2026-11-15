import type { APIRoute } from "astro";

import rss from "@astrojs/rss";

import { articlePath, getArticles, getGlobal, toDate } from "../lib/cms";

export const GET: APIRoute = async (context) => {
  const [site, articles] = await Promise.all([getGlobal(), getArticles()]);
  return rss({
    title: site.siteName,
    description: site.siteDescription,
    site: context.site ?? context.url.origin,
    items: articles.flatMap((article) => {
      const link = articlePath(article);
      if (!link || !article.title) return [];
      return [
        {
          title: article.title,
          description: article.description ?? undefined,
          pubDate: article.publicationDate
            ? toDate(article.publicationDate)
            : undefined,
          link,
        },
      ];
    }),
  });
};
