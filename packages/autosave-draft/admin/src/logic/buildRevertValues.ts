import { isPlainObject } from "./isPlainObject";

type Values = Record<string, unknown>;

/** Describe attributes used by revert. `component` is a component UID. */
type Attributes = Record<string, { type: string; component?: string }>;

/** Map component UIDs to schemas from `unstable_useDocument`. */
type ComponentSchemas = Record<string, { attributes: Attributes } | undefined>;

type RestoreField = (
  attribute: Attributes[string],
  snapshotValue: unknown,
  currentValue: unknown,
) => unknown;

/** Dynamic zone IDs only match within the same component type. */
const findCurrentEntry = (
  entry: Values,
  currentEntries: Values[],
  isZone: boolean,
): Values | undefined => {
  if (entry["id"] === undefined || entry["id"] === null) {
    return undefined;
  }

  return currentEntries.find(
    (candidate) =>
      candidate["id"] === entry["id"] &&
      (!isZone || candidate["__component"] === entry["__component"]),
  );
};

/**
 * Remove stale component IDs so Strapi recreates those instances.
 * Existing component instances retain their current relation state.
 */
const createFieldRestorer = (components: ComponentSchemas): RestoreField => {
  const restoreField: RestoreField = (
    attribute,
    snapshotValue,
    currentValue,
  ): unknown => {
    const isZone = attribute.type === "dynamiczone";

    if (
      attribute.type !== "component" &&
      !(isZone && Array.isArray(snapshotValue))
    ) {
      return snapshotValue;
    }

    const currentEntries = (
      Array.isArray(currentValue) ? currentValue : [currentValue]
    ).filter((value: unknown): value is Values => isPlainObject(value));

    // Keep this beside the recursive restorer that it calls.
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const restoreComponent = (
      entry: Values,
      match: Values | undefined,
      attributes: Attributes,
    ): Values => {
      const result: Values = { ...entry };

      if (!match) {
        delete result["id"];
      }

      for (const [name, nested] of Object.entries(attributes)) {
        if (nested.type === "relation") {
          if (match) {
            result[name] = match[name];
          }
        } else if (
          nested.type === "component" ||
          nested.type === "dynamiczone"
        ) {
          result[name] = restoreField(nested, entry[name], match?.[name]);
        }
      }

      return result;
    };

    const restoreEntry = (entry: unknown): unknown => {
      if (!isPlainObject(entry)) {
        return entry;
      }

      const uid = isZone ? entry["__component"] : attribute.component;
      const attributes =
        typeof uid === "string" ? (components[uid]?.attributes ?? {}) : {};
      const match = findCurrentEntry(entry, currentEntries, isZone);

      return restoreComponent(entry, match, attributes);
    };

    return Array.isArray(snapshotValue)
      ? snapshotValue.map((entry: unknown) => restoreEntry(entry))
      : restoreEntry(snapshotValue);
  };

  return restoreField;
};

/**
 * Restore snapshot fields without mutating either input.
 * Keep current top-level relations, media and keys absent from the schema.
 */
export const buildRevertValues = (input: {
  snapshot: Values;
  current: Values;
  attributes: Attributes;
  components: ComponentSchemas;
}): Values => {
  const { snapshot, current, attributes, components } = input;
  const result: Values = { ...current };
  const restoreField = createFieldRestorer(components);

  for (const [name, attribute] of Object.entries(attributes)) {
    if (attribute.type !== "relation" && attribute.type !== "media") {
      result[name] = restoreField(attribute, snapshot[name], current[name]);
    }
  }

  return result;
};

export type { Attributes, ComponentSchemas };
