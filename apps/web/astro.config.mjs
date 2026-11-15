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
    throw new Error(
      `${name} is not set. Run through mise, which loads .env.yaml.`,
    );
  }
  return value;
}

// https://astro.build/config
export default defineConfig({
  site: requireEnv("WEB_URL"),
  // Every page reads the CMS on each request, so edits show without a rebuild.
  output: "server",
  server: { port: Number(requireEnv("WEB_PORT")) },
  integrations: [mdx(), sitemap()],

  env: {
    schema: {
      // Read at run time on the server only; the browser never calls Strapi's
      // REST API directly.
      STRAPI_URL: envField.string({
        context: "server",
        access: "secret",
        url: true,
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
