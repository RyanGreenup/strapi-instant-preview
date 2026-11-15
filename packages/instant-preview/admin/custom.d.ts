declare module '@strapi/design-system/*';
declare module '@strapi/design-system';

interface ImportMeta {
  glob<T>(pattern: string): Record<string, () => Promise<T>>;
}
