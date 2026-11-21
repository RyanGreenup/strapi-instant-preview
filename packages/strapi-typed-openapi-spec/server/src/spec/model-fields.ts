import type { Attribute, Model } from "../adapter";

import { fileUid } from "../schemas";

type Models = {
  contentTypes: Record<string, Model>;
  components: Record<string, Model>;
  privateAttributes?: readonly string[];
};
type Field = {
  name: string;
  attribute: Attribute;
  private: boolean;
  target?: string;
  polymorphic: boolean;
};
type Facts = {
  model?: Model;
  isContentType: boolean;
  attributes: Field[];
  isPrivate(name: string): boolean;
};
export type ModelFields = ReturnType<typeof createModelFields>;

export function createModelFields({
  contentTypes,
  components,
  privateAttributes,
}: Models) {
  const globalPrivate = new Set(privateAttributes);
  const cache = new Map<string, Facts>();
  function get(uid: string): Facts {
    const cached = cache.get(uid);
    if (cached) return cached;
    const isContentType = Object.hasOwn(contentTypes, uid);
    const model = isContentType
      ? contentTypes[uid]
      : Object.hasOwn(components, uid)
        ? components[uid]
        : undefined;
    const localPrivate = new Set(model?.options?.privateAttributes);
    const isPrivate = (name: string) =>
      localPrivate.has(name) || globalPrivate.has(name);
    const attributes = Object.entries(model?.attributes ?? {}).map(
      ([name, attribute]) => {
        let uid: unknown;
        switch (attribute.type) {
          case "media":
            uid = fileUid;
            break;
          case "component":
            uid = attribute.component;
            break;
          case "relation":
            uid = attribute.target;
            break;
        }
        const target =
          typeof uid === "string" &&
          (Object.hasOwn(components, uid) || Object.hasOwn(contentTypes, uid))
            ? uid
            : undefined;
        return {
          name,
          attribute,
          private: attribute.private === true || isPrivate(name),
          target,
          polymorphic:
            attribute.type === "relation" &&
            typeof attribute.relation === "string" &&
            attribute.relation.startsWith("morphTo"),
        };
      },
    );
    const facts = { model, isContentType, isPrivate, attributes };
    cache.set(uid, facts);
    return facts;
  }
  return { get, contentTypeUids: Object.keys(contentTypes) };
}
