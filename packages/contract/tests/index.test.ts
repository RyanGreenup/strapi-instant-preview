import { describe, expect, it } from "vitest";

import {
  aboutRoute,
  blogPostRoute,
  global,
  homeRoute,
  routes,
  strapiResponse,
} from "../src/index";

const cover = {
  id: 1,
  documentId: "m1",
  url: "/uploads/cover.jpg",
  alternativeText: null,
  width: 1020,
  height: 510,
  mime: "image/jpeg",
};

const article = {
  documentId: "a1",
  title: "First post",
  description: "Lorem ipsum",
  slug: "first-post",
  cover,
  publicationDate: "2022-07-08",
  updatedDate: null,
  author: null,
  category: null,
  blocks: [{ __component: "shared.rich-text", id: 1, body: "# Hello" }],
  seo: null,
};

describe("route contracts", () => {
  it("covers every page route", { timeout: 1000 }, () => {
    expect(Object.values(routes).map((route) => route.path)).toStrictEqual([
      "/",
      "/blog",
      "/blog/[...slug]",
      "/about",
      "/rss.xml",
    ]);
  });

  it("accepts an article response", { timeout: 1000 }, () => {
    const body = { data: [article], meta: { pagination: { total: 1 } } };

    expect(strapiResponse(blogPostRoute.data).parse(body).data).toHaveLength(1);
  });

  it("rejects an unknown dynamic zone block", { timeout: 1000 }, () => {
    const page = {
      title: null,
      hero: null,
      seo: null,
      blocks: [{ __component: "shared.unknown", id: 1 }],
    };

    expect(aboutRoute.data.safeParse(page).success).toBe(false);
  });

  it("allows an article grid on the home page only", { timeout: 1000 }, () => {
    const grid = {
      __component: "sections.article-grid",
      id: 2,
      title: "Latest",
      featuredFirst: true,
      articles: [],
    };
    const page = { hero: null, seo: null, blocks: [grid] };

    expect(homeRoute.data.safeParse(page).success).toBe(true);
    expect(aboutRoute.data.safeParse({ ...page, title: null }).success).toBe(
      false,
    );
  });

  it(
    "requires a slug parameter on the blog post route",
    { timeout: 1000 },
    () => {
      expect(blogPostRoute.params.safeParse({ slug: "" }).success).toBe(false);
    },
  );

  it("requires the site name in the global data", { timeout: 1000 }, () => {
    const data = {
      siteDescription: "Welcome",
      favicon: null,
      defaultSeo: null,
      header: null,
      footer: null,
      socialLinks: [],
    };

    expect(global.safeParse(data).success).toBe(false);
  });
});
