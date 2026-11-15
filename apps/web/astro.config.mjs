// @ts-check

import mdx from "@astrojs/mdx";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import { defineConfig, envField, fontProviders } from "astro/config";

/**
 * Read a variable from the repo's .env.yaml, which mise loads into the shell.
 *
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Run through mise, which loads .env.yaml.`);
  }
  return value;
}

// https://astro.build/config
export default defineConfig({
  site: requireEnv("WEB_URL"),
  // Must be SSR for the live preview as it reads Strapi to as the user edits.
  output: "server",
  server: { port: Number(requireEnv("WEB_PORT")) },
  integrations: [mdx(), sitemap()],

  env: {
    schema: {
      STRAPI_URL: envField.string({
        context: "server",
        access: "secret",
        url: true,
      }),
      STRAPI_ADMIN_SEED_API_TOKEN: envField.string({
        context: "server",
        access: "secret",
      }),
      // Use Strapi's browser-facing address for media URLs and preview framing.
      // Set it when STRAPI_URL is internal, e.g. cluster internal.
      // Mark it "secret" for runtime access across deployments, Astro fixes "public" fields at build time.
      STRAPI_PUBLIC_URL: envField.string({
        context: "server",
        access: "secret",
        url: true,
        optional: true,
      }),
      // Set this only on preview deployments to verify links signed by Strapi.
      // Without it, every preview link is refused.
      PREVIEW_SECRET: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },

  fonts: [
    {
      provider: fontProviders.local(),
      name: "Atkinson",
      cssVariable: "--font-atkinson",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/atkinson-regular.woff"],
            weight: 400,
            style: "normal",
            display: "swap",
          },
          {
            src: ["./src/assets/fonts/atkinson-bold.woff"],
            weight: 700,
            style: "normal",
            display: "swap",
          },
        ],
      },
    },
  ],

  adapter: node({
    mode: "standalone",
  }),
});
