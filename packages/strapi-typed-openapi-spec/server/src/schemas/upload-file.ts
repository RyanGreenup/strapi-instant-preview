import type { ZodType } from "zod/v4";

import type { Zod } from "../adapter";
import type { SchemaRegistry } from "./modifiers";

export interface FileJsonSchemas {
  formats: ZodType;
  focalPoint: ZodType;
}

/**
 * Shapes of the json attributes of `plugin::upload.file`. Strapi has no model
 * for them, so they are declared here: the upload plugin's image manipulation
 * writes one format entry per generated size (null for non-images), and its
 * fileInfo validator bounds the focal point to 0-100. Objects stay loose so
 * provider-specific extras pass. `provider_metadata` is left unconstrained.
 */
export function fileJsonSchemas(
  z: Zod,
  registry: SchemaRegistry,
): FileJsonSchemas {
  const format = z
    .looseObject({
      name: z.string(),
      hash: z.string(),
      ext: z.string(),
      mime: z.string(),
      // Older rows and some providers leave these out.
      path: z.string().nullish(),
      width: z.number(),
      height: z.number(),
      size: z.number().describe("Size in kilobytes."),
      sizeInBytes: z.number().optional(),
      url: z.string(),
    })
    .register(registry, { id: "StrapiFileFormat" });
  const percent = z.number().min(0).max(100);
  const focalPoint = z
    .looseObject({ x: percent, y: percent })
    .register(registry, { id: "StrapiFileFocalPoint" });
  return {
    formats: z
      .record(z.string(), format)
      .describe(
        "Generated image sizes keyed by size name, such as thumbnail or small.",
      ),
    focalPoint,
  };
}
