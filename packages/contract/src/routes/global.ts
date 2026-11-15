import { z } from "zod";

import { link, media, seo, socialLink } from "../strapi";

/** The `layout.header` component. */
export const header = z.object({
  siteTitle: z.string().nullable(),
  homeLink: link.nullable(),
  navigation: z.array(link),
});

/** The `layout.footer` component. */
export const footer = z.object({
  copyrightOwner: z.string().nullable(),
  rightsNotice: z.string().nullable(),
});

/**
 * The `global` single type. Every page renders it in its head, header and
 * footer, so it is not tied to one route.
 */
export const global = z.object({
  siteName: z.string(),
  siteDescription: z.string(),
  favicon: media.nullable(),
  defaultSeo: seo.nullable(),
  header: header.nullable(),
  footer: footer.nullable(),
  socialLinks: z.array(socialLink),
});

/** Where the layout data comes from. */
export const globalEndpoint = "/api/global";

export type Header = z.infer<typeof header>;
export type Footer = z.infer<typeof footer>;
export type Global = z.infer<typeof global>;
