import type { App } from "./adapter";

import { initializeRuntime } from "./runtime";

export default function bootstrap({ strapi }: { strapi: App }) {
  initializeRuntime(strapi);
}
