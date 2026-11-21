import type { ZodArray, ZodType } from "zod/v4";

import type { Zod } from "../adapter";
import type { FileJsonSchemas } from "./upload-file";

import { asResponseField, type SchemaRegistry } from "./modifiers";

/** The keys Strapi defines on each Blocks node type. */
export const reservedBlockKeys = {
  paragraph: ["type", "children"],
  quote: ["type", "children"],
  code: ["type", "language", "children"],
  heading: ["type", "level", "children"],
  list: ["type", "format", "indentLevel", "children"],
  "list-item": ["type", "children"],
  image: ["type", "image", "children"],
  text: [
    "type",
    "text",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "code",
  ],
  link: ["type", "url", "rel", "target", "children"],
} as const satisfies Record<string, readonly string[]>;

export type BlockNodeType = keyof typeof reservedBlockKeys;
export const blockNodeTypes = Object.keys(reservedBlockKeys) as [
  BlockNodeType,
  ...BlockNodeType[],
];
export type BlockPropertyType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | { enum: readonly (string | number | boolean)[] };
/**
 * Properties that the app's rich text editor adds to Blocks nodes, by node
 * type. Strapi stores unknown node keys without checking them, so a
 * declaration is the app's own claim about its editor.
 */
export type BlocksProperties = Partial<
  Record<BlockNodeType, Record<string, BlockPropertyType>>
>;

const declaredDescription =
  "Declared by the app in blocksProperties. Strapi does not validate it.";

function declaredValue(z: Zod, type: BlockPropertyType): ZodType {
  if (typeof type === "object")
    return z.literal(type.enum as (string | number | boolean)[]);
  switch (type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
  }
}

/**
 * Registers the schema for one Blocks node and its recursive list schema.
 * Input checks link URLs and requires nonempty child arrays for paragraphs,
 * quotes, code, headings, and lists. An input image node requires its `image` payload.
 * Each node keeps unknown keys; `declared` adds typed optional properties.
 */
export function createBlocks(
  z: Zod,
  registry: SchemaRegistry,
  mode: "input" | "response",
  fileJson: FileJsonSchemas,
  declared: BlocksProperties = {},
) {
  const extra = (node: BlockNodeType): Record<string, ZodType> =>
    Object.fromEntries(
      Object.entries(declared[node] ?? {}).map(([key, type]) => [
        key,
        declaredValue(z, type).describe(declaredDescription).optional(),
      ]),
    );
  const suffix = mode === "input" ? "Input" : "";
  const input = mode === "input";
  const nonEmpty = <T extends ZodType>(array: ZodArray<T>) =>
    input ? array.min(1) : array;
  const requiredText = input ? z.string().min(1) : z.string();
  const linkUrl = input
    ? z
        .string()
        .regex(
          /^(?:\/\S*|(?:https?|ftp):\/\/(?:[A-Za-z0-9-]*\.)*[A-Za-z][A-Za-z0-9-]*(?::(?:[0-5]?\d{1,4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5]))?(?:[/?#]\S*)?|(?:mailto|tel):\S*)$/,
        )
    : z.string();
  const text = z.looseObject({
    type: z.literal("text"),
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strikethrough: z.boolean().optional(),
    code: z.boolean().optional(),
    ...extra("text"),
  });
  const inline = z.discriminatedUnion("type", [
    text,
    z.looseObject({
      type: z.literal("link"),
      url: linkUrl,
      rel: z.string().optional(),
      target: z.string().optional(),
      children: z.array(text),
      ...extra("link"),
    }),
  ]);
  const children = z.array(inline);
  const listItem = z.looseObject({
    type: z.literal("list-item"),
    children,
    ...extra("list-item"),
  });
  const list = z
    .looseObject({
      type: z.literal("list"),
      format: z.enum(["ordered", "unordered"]),
      indentLevel: z.number().optional(),
      children: nonEmpty(
        z.array(z.union([listItem, z.lazy((): ZodType => list)])),
      ),
      ...extra("list"),
    })
    .register(registry, { id: `StrapiBlocksListNode${suffix}` });

  const image = z.looseObject({
    name: requiredText,
    url: requiredText,
    width: z.number(),
    height: z.number(),
    hash: requiredText,
    ext: requiredText,
    mime: requiredText,
    size: z.number(),
    provider: requiredText,
    createdAt: requiredText,
    updatedAt: requiredText,
    alternativeText: asResponseField(z.string()),
    caption: asResponseField(z.string()),
    formats: asResponseField(fileJson.formats),
    focalPoint: asResponseField(fileJson.focalPoint),
    previewUrl: asResponseField(z.string()),
    provider_metadata: z.unknown().optional(),
  });

  return z
    .discriminatedUnion("type", [
      z.looseObject({
        type: z.literal("paragraph"),
        children: nonEmpty(children),
        ...extra("paragraph"),
      }),
      z.looseObject({
        type: z.literal("quote"),
        children: nonEmpty(children),
        ...extra("quote"),
      }),
      z.looseObject({
        type: z.literal("code"),
        language: asResponseField(z.string()),
        children: nonEmpty(z.array(text)),
        ...extra("code"),
      }),
      z.looseObject({
        type: z.literal("heading"),
        level: z.literal([1, 2, 3, 4, 5, 6]),
        children: nonEmpty(children),
        ...extra("heading"),
      }),
      list,
      z.looseObject({
        type: z.literal("image"),
        image: mode === "input" ? image : image.optional(),
        children,
        ...extra("image"),
      }),
    ])
    .register(registry, { id: `StrapiBlocksNode${suffix}` });
}
