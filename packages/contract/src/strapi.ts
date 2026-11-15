import { z } from "zod";

/**
 * Build the base of one dynamic zone entry. Strapi tags each entry with its
 * component UID in `__component`.
 *
 * @param uid - The component UID, for example `shared.quote`.
 * @returns The tag fields, to extend with the component's own fields.
 */
const block = <Uid extends string>(
  uid: Uid,
): z.ZodObject<{ __component: z.ZodLiteral<Uid>; id: z.ZodNumber }> =>
  z.object({ __component: z.literal(uid), id: z.number() });

/** A Strapi media file, as the REST API returns it once populated. */
export const media = z.object({
  id: z.number(),
  documentId: z.string(),
  url: z.string(),
  alternativeText: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  mime: z.string(),
});

/** A Strapi `date` field, serialised as `YYYY-MM-DD`. */
export const date = z.iso.date();

/** The `shared.link` component. */
export const link = z.object({
  label: z.string(),
  href: z.string(),
  newTab: z.boolean(),
});

/** The `shared.social-link` component. */
export const socialLink = link.extend({
  platform: z.enum(["mastodon", "twitter", "github"]).nullable(),
});

/** The `shared.seo` component. */
export const seo = z.object({
  metaTitle: z.string(),
  metaDescription: z.string(),
  shareImage: media.nullable(),
  canonicalURL: z.string().nullable(),
});

/** The `shared.hero` component. */
export const hero = z.object({
  title: z.string(),
  description: z.string().nullable(),
  image: media.nullable(),
  publicationDate: date.nullable(),
  updatedDate: date.nullable(),
});

/** The `shared.media` component inside a dynamic zone. */
export const mediaBlock = block("shared.media").extend({
  file: media.nullable(),
});

/** The `shared.quote` component inside a dynamic zone. */
export const quoteBlock = block("shared.quote").extend({
  title: z.string().nullable(),
  body: z.string().nullable(),
});

/** The `shared.rich-text` component inside a dynamic zone. Body is Markdown. */
export const richTextBlock = block("shared.rich-text").extend({
  body: z.string().nullable(),
});

/** The `shared.slider` component inside a dynamic zone. */
export const sliderBlock = block("shared.slider").extend({
  files: z.array(media),
});

/** The `shared.link` component inside a dynamic zone. */
export const linkBlock = block("shared.link").extend(link.shape);

/** The dynamic zone shared by the home, about and article types. */
export const contentBlock = z.discriminatedUnion("__component", [
  mediaBlock,
  quoteBlock,
  richTextBlock,
  sliderBlock,
  linkBlock,
]);

/** An article as a list or grid shows it: no body, author or category. */
export const articleSummary = z.object({
  documentId: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  slug: z.string().nullable(),
  cover: media.nullable(),
  publicationDate: date.nullable(),
  updatedDate: date.nullable(),
});

/** The `sections.article-grid` component. */
export const articleGrid = z.object({
  title: z.string().nullable(),
  featuredFirst: z.boolean(),
  articles: z.array(articleSummary),
});

/** The `sections.article-grid` component inside a dynamic zone. */
export const articleGridBlock = block("sections.article-grid").extend(
  articleGrid.shape,
);

/**
 * Wrap a schema in the `{ data, meta }` envelope of a Strapi REST response.
 *
 * @param data - The schema of the `data` member.
 * @returns The schema of the full response body.
 */
export const strapiResponse = <Data extends z.ZodType>(
  data: Data,
): z.ZodObject<{ data: Data; meta: z.ZodRecord<z.ZodString, z.ZodUnknown> }> =>
  z.object({ data, meta: z.record(z.string(), z.unknown()) });

export type Media = z.infer<typeof media>;
export type Link = z.infer<typeof link>;
export type SocialLink = z.infer<typeof socialLink>;
export type Seo = z.infer<typeof seo>;
export type Hero = z.infer<typeof hero>;
export type ContentBlock = z.infer<typeof contentBlock>;
export type ArticleSummary = z.infer<typeof articleSummary>;
export type ArticleGrid = z.infer<typeof articleGrid>;
