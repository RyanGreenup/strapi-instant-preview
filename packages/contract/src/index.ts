import { aboutRoute } from "./routes/about";
import { blogRoute } from "./routes/blog";
import { blogPostRoute } from "./routes/blog-post";
import { homeRoute } from "./routes/home";
import { rssRoute } from "./routes/rss";

/** Every route contract, keyed by name. */
export const routes = {
  home: homeRoute,
  blog: blogRoute,
  blogPost: blogPostRoute,
  about: aboutRoute,
  rss: rssRoute,
} as const;

export { defineRoute, type RouteContract } from "./route";
export {
  articleGrid,
  articleGridBlock,
  articleSummary,
  contentBlock,
  date,
  hero,
  link,
  linkBlock,
  media,
  mediaBlock,
  quoteBlock,
  richTextBlock,
  seo,
  sliderBlock,
  socialLink,
  strapiResponse,
  type ArticleGrid,
  type ArticleSummary,
  type ContentBlock,
  type Hero,
  type Link,
  type Media,
  type Seo,
  type SocialLink,
} from "./strapi";
export {
  footer,
  global,
  globalEndpoint,
  header,
  type Footer,
  type Global,
  type Header,
} from "./routes/global";
export { aboutPage, aboutRoute, type AboutPage } from "./routes/about";
export { blogPage, blogRoute, type BlogPage } from "./routes/blog";
export {
  author,
  blogPost,
  blogPostRoute,
  category,
  type Author,
  type BlogPost,
  type Category,
} from "./routes/blog-post";
export { homePage, homeRoute, type HomePage } from "./routes/home";
export { rssRoute, type RssFeed } from "./routes/rss";
