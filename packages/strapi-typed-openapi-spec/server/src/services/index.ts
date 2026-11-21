import type { App } from "../adapter";

import { declare } from "../contract";
import { runtime } from "../runtime";
import { assemble } from "../spec/assemble";

export default {
  contract: ({ strapi }: { strapi: App }) => ({
    declare: declare.bind(null, strapi),
  }),
  spec: ({ strapi }: { strapi: App }) => ({
    generate: assemble.bind(null, strapi),
    cached: () => runtime(strapi).document,
  }),
  runtime: ({ strapi }: { strapi: App }) => ({
    enabled: () => runtime(strapi).enabled,
    violations: () => runtime(strapi).violations.slice(),
  }),
};
