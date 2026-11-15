// Strapi passes its admin Vite config here and uses the returned one.
// `vite` is not a dependency of this app, so the config is typed locally.
interface AdminViteConfig {
  resolve?: { dedupe?: string[] } & Record<string, unknown>;
  [key: string]: unknown;
}

// The workspace plugins import `@strapi/content-manager/strapi-admin`, which
// pnpm resolves to each plugin's own copy. Strapi only dedupes
// `@strapi/strapi`. This prevents the admin bundling a second Content
// Manager which stops the browser showing anything.
export default (config: AdminViteConfig): AdminViteConfig => ({
  ...config,
  resolve: {
    ...config.resolve,
    dedupe: [...(config.resolve?.dedupe ?? []), "@strapi/content-manager"],
  },
});
