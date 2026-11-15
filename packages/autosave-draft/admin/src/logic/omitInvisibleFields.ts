import type { JsonLogicCondition } from "@strapi/strapi/admin";

import { createRulesEngine } from "@strapi/strapi/admin";

import { isPlainObject } from "./isPlainObject";

type Values = Record<string, unknown>;
interface Attribute {
  type: string;
  component?: string;
  repeatable?: boolean;
  visible?: boolean;
  conditions?: { visible?: JsonLogicCondition };
}
type Attributes = Record<string, Attribute>;
type Components = Record<string, { attributes: Attributes } | undefined>;
interface FilterOptions {
  attributes: Attributes | undefined;
  initialValues: Values;
  components: Components;
  evaluateConditions?: boolean;
}
interface FieldOptions {
  initial: unknown;
  components: Components;
  evaluateConditions: boolean;
  userProvided: boolean;
}
const rules = createRulesEngine();

const componentBaseline = (initial: unknown, item: Values): Values => {
  const candidate: unknown = Array.isArray(initial)
    ? initial.find(
        (entry: unknown) =>
          isPlainObject(entry) &&
          entry["__temp_key__"] === item["__temp_key__"],
      )
    : initial;
  if (
    !isPlainObject(candidate) ||
    (candidate["id"] ?? null) !== (item["id"] ?? null)
  ) {
    return {};
  }
  const initialType = candidate["__component"];
  const currentType = item["__component"];
  return initialType === undefined ||
    currentType === undefined ||
    initialType === currentType
    ? candidate
    : {};
};

const cleanComponent = (
  item: unknown,
  uid: string | undefined,
  options: FieldOptions,
): unknown => {
  if (!isPlainObject(item)) {
    return item;
  }
  // Mutual recursion follows nested component schemas.
  // eslint-disable-next-line no-use-before-define
  return omitInvisibleFields(item, {
    attributes:
      uid === undefined ? undefined : options.components[uid]?.attributes,
    initialValues: componentBaseline(options.initial, item),
    components: options.components,
    evaluateConditions: options.evaluateConditions,
  });
};

const cleanDynamicZone = (value: unknown, options: FieldOptions): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item: unknown) => {
    if (!isPlainObject(item)) {
      return item;
    }
    const uid = item["__component"];
    const cleaned = cleanComponent(
      item,
      typeof uid === "string" ? uid : undefined,
      options,
    );
    const result: Values = {
      __component: uid,
      ...(isPlainObject(cleaned) ? cleaned : {}),
    };
    if (item["id"] === undefined || item["id"] === null) {
      result["id"] = undefined;
    }
    return result;
  });
};

const cleanComponentField = (
  current: unknown,
  attribute: Attribute,
  options: FieldOptions,
): unknown => {
  const value = current === undefined ? options.initial : current;
  const hasValue = Boolean(value);
  if (!hasValue) {
    return attribute.repeatable === true ? [] : null;
  }
  // Save only evaluates conditions in the submitted tree, not baseline fallbacks.
  const nestedOptions = {
    ...options,
    evaluateConditions: options.evaluateConditions && current !== undefined,
  };
  return attribute.repeatable === true && Array.isArray(value)
    ? value.map((item: unknown) =>
        cleanComponent(item, attribute.component, nestedOptions),
      )
    : cleanComponent(value, attribute.component, nestedOptions);
};

const cleanValue = (
  current: unknown,
  attribute: Attribute,
  options: FieldOptions,
): unknown => {
  if (attribute.visible === false) {
    return options.userProvided ? current : options.initial;
  }
  if (attribute.type === "dynamiczone") {
    return cleanDynamicZone(current, options);
  }
  if (attribute.type === "component") {
    return cleanComponentField(current, attribute, options);
  }
  return current === undefined ? options.initial : current;
};

const isHidden = (
  attribute: Attribute,
  data: Values,
  evaluate: boolean,
): boolean => {
  const condition = attribute.conditions?.visible;
  return (
    evaluate &&
    attribute.visible !== false &&
    Boolean(condition) &&
    !rules.evaluate(condition ?? true, data)
  );
};

/** Match Strapi Save's visibility filtering, including component baseline identity. */
export const omitInvisibleFields = (
  data: Values,
  options: FilterOptions,
): Values => {
  const {
    attributes,
    initialValues,
    components,
    evaluateConditions = true,
  } = options;
  if (!attributes) {
    return data;
  }
  const result: Values = {};
  for (const [name, attribute] of Object.entries(attributes)) {
    if (!isHidden(attribute, data, evaluateConditions)) {
      const value = cleanValue(data[name], attribute, {
        initial: initialValues[name],
        components,
        evaluateConditions,
        userProvided: Object.hasOwn(data, name),
      });
      if (value !== undefined) {
        result[name] = value;
      }
    }
  }
  for (const [name, value] of Object.entries(data)) {
    if (!(name in attributes)) {
      result[name] = value;
    }
  }
  return result;
};

export type { Attributes, Components };
