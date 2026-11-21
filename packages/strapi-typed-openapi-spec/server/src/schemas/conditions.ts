import { apply, type RulesLogic } from "json-logic-js";

import type { Model } from "../adapter";

type JSONSchema = Record<string, unknown>;
type Attribute = Model["attributes"][string];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function visibility(attribute: unknown) {
  if (record(attribute) && record(attribute.conditions))
    return attribute.conditions.visible;
}

// Operators whose result depends only on whether a variable equals one of the
// rule's literals. Evaluating such a rule for each literal, null, and one
// stand-in for "any other value" covers every possible value exactly.
const equalityOperators = new Set([
  "==",
  "!=",
  "===",
  "!==",
  "in",
  "and",
  "or",
  "!",
  "!!",
  "if",
  "var",
]);
const looseOperators = new Set(["==", "!="]);
const stringTypes = new Set(["string", "text", "richtext", "email", "uid"]);
const numberTypes = new Set(["integer", "float", "decimal"]);
const maxCombinations = 512;

type Analysis =
  | { variables: Set<string>; literals: unknown[]; loose: boolean }
  | undefined;

function analyse(
  rule: unknown,
  found: NonNullable<Analysis> = {
    variables: new Set(),
    literals: [],
    loose: false,
  },
): Analysis {
  if (Array.isArray(rule)) {
    for (const item of rule) if (!analyse(item, found)) return undefined;
    return found;
  }
  if (!record(rule)) {
    if (rule === null || ["string", "number", "boolean"].includes(typeof rule))
      found.literals.push(rule);
    else return undefined;
    return found;
  }
  const entries = Object.entries(rule);
  if (entries.length !== 1) return undefined;
  const [operator, operands] = entries[0];
  if (!equalityOperators.has(operator)) return undefined;
  if (operator === "var") {
    if (typeof operands !== "string" || !operands || operands.includes("."))
      return undefined;
    found.variables.add(operands);
    return found;
  }
  // `in` with a string haystack is a substring test, not equality.
  if (
    operator === "in" &&
    (!Array.isArray(operands) || !Array.isArray(operands[1]))
  )
    return undefined;
  if (looseOperators.has(operator)) found.loose = true;
  return analyse(Array.isArray(operands) ? operands : [operands], found);
}

const other = Symbol("other");
type Point = unknown | typeof other;

/** The values a variable can take that the rule tells apart, or undefined when coercion makes that unsafe. */
function domain(
  attribute: Attribute | undefined,
  literals: unknown[],
  loose: boolean,
): Point[] | undefined {
  if (!attribute) return undefined;
  if (attribute.type === "boolean") return [false, true, null];
  if (
    attribute.type === "enumeration" &&
    Array.isArray(attribute.enum) &&
    attribute.enum.length &&
    attribute.enum.every((value) => typeof value === "string")
  )
    return [...new Set(attribute.enum), null];
  // An open domain is safe when no literal can coerce to a value of the attribute's type.
  const kind = stringTypes.has(attribute.type)
    ? "string"
    : numberTypes.has(attribute.type)
      ? "number"
      : undefined;
  if (!kind) return undefined;
  const scalars = literals.filter((value) => value !== null);
  if (
    scalars.some((value) => typeof value !== kind) &&
    (loose || scalars.some((value) => typeof value === "boolean"))
  )
    return undefined;
  return [
    ...new Set(scalars.filter((value) => typeof value === kind)),
    null,
    other,
  ];
}

function standIn(values: Point[]): unknown {
  const known = values.filter((value) => value !== other && value !== null);
  if (known.every((value) => typeof value === "number"))
    return Math.max(0, ...(known as number[])) + 0.5;
  let candidate = "other";
  while (known.includes(candidate)) candidate += "_";
  return candidate;
}

function constraint(key: string, point: Point, values: Point[]): JSONSchema {
  if (point !== other)
    return { required: [key], properties: { [key]: { const: point } } };
  return {
    required: [key],
    properties: {
      [key]: { not: { enum: values.filter((value) => value !== other) } },
    },
  };
}

/**
 * A JSON Schema predicate that holds exactly when `rule` makes a field visible,
 * or undefined when the rule cannot be represented.
 *
 * - 'create': an omitted variable takes the attribute's schema default.
 * - 'response': an omitted variable is unknown (fields/populate may leave it
 *   out), so the predicate requires it to be present.
 *
 * If none of the cases makes the field visible, the result is `false`.
 *
 * @param available - Field keys the enclosing schema can supply to the rule.
 */
export function compileVisible(
  model: Model,
  rule: unknown,
  available: Set<string>,
  mode: "create" | "response",
): JSONSchema | false | undefined {
  const analysis = analyse(rule);
  if (!analysis || !analysis.variables.size) return undefined;
  const names = [...analysis.variables];
  const domains: Point[][] = [];
  for (const name of names) {
    if (!available.has(name)) return undefined;
    const values = domain(
      model.attributes[name],
      analysis.literals,
      analysis.loose,
    );
    if (!values) return undefined;
    domains.push(mode === "create" ? [...values, undefined] : values);
  }
  if (
    domains.reduce((size, values) => size * values.length, 1) > maxCombinations
  )
    return undefined;

  const matches: JSONSchema[] = [];
  const visit = (
    index: number,
    data: Record<string, unknown>,
    parts: JSONSchema[],
  ) => {
    if (index === names.length) {
      if (apply(rule as RulesLogic, data))
        matches.push(parts.length === 1 ? parts[0] : { allOf: parts });
      return;
    }
    const name = names[index];
    for (const point of domains[index]) {
      const next = { ...data };
      let part: JSONSchema;
      if (point === undefined) {
        // Omitted on create: Strapi applies the schema default before evaluating the rule.
        // A computed default is unknown here, so the omitted case is left unconstrained.
        const fallback = model.attributes[name]?.default;
        if (typeof fallback === "function") continue;
        if (fallback !== undefined) next[name] = fallback;
        part = { not: { required: [name] } };
      } else {
        next[name] = point === other ? standIn(domains[index]) : point;
        part = constraint(
          name,
          point,
          domains[index].filter((value) => value !== undefined),
        );
      }
      visit(index + 1, next, [...parts, part]);
    }
  };
  visit(0, {}, []);
  if (!matches.length) return false;
  return matches.length === 1 ? matches[0] : { anyOf: matches };
}

function isLooseComparison(rule: unknown) {
  return (
    record(rule) &&
    Object.keys(rule).length === 1 &&
    looseOperators.has(Object.keys(rule)[0])
  );
}

/**
 * `if`/`then` rules for required fields with `conditions.visible`.
 *
 * - 'create' (published create input): a visible required field must be sent and non-null.
 * - 'response' (published response document): a visible required field is non-null when present.
 *
 * A rule that cannot be represented leaves the field relaxed. On create, an
 * unrepresentable loose comparison is reported through `onUnsupported`.
 */
export function visibleRequirements(
  model: Model,
  keys: string[],
  mode: "create" | "response",
  onUnsupported?: (key: string) => void,
  isEnforced: (key: string) => boolean = () => true,
) {
  const rules: JSONSchema[] = [];
  const available = new Set(keys);
  for (const key of keys) {
    const attribute = model.attributes[key];
    if (
      attribute?.required !== true ||
      (mode === "create" && attribute.default !== undefined)
    )
      continue;
    if (!isEnforced(key)) continue;
    const rule = visibility(attribute);
    if (rule === undefined) continue;
    const condition = compileVisible(model, rule, available, mode);
    if (condition === undefined) {
      if (mode === "create" && isLooseComparison(rule)) onUnsupported?.(key);
      continue;
    }
    if (condition === false) continue;
    rules.push({
      if: condition,
      then:
        mode === "create"
          ? {
              required: [key],
              properties: { [key]: { not: { type: "null" } } },
            }
          : { properties: { [key]: { not: { type: "null" } } } },
    });
  }
  return rules;
}

// `isEnforced` leaves out fields whose `required` Strapi does not check on this
// app (relations and media without `api.documents.strictRelations`).
export function publishedRequirements(
  model: Model,
  writableFields: string[],
  onUnsupported?: (key: string) => void,
  isEnforced?: (key: string) => boolean,
) {
  return visibleRequirements(
    model,
    writableFields,
    "create",
    onUnsupported,
    isEnforced,
  );
}

/**
 * `if`/`then` rules that restore the value rules of conditional fields on create.
 *
 * Strapi skips every rule of a field that its condition hides, so the field's
 * own schema only keeps its type (see the unchecked scalar modes). While the
 * field is visible, `rulesFor(key)` (a JSON Schema of the value with its rules)
 * applies again. A rule that cannot be represented leaves the field relaxed.
 */
export function visibleConstraints(
  model: Model,
  keys: string[],
  rulesFor: (key: string) => JSONSchema | undefined,
) {
  const rules: JSONSchema[] = [];
  const available = new Set(keys);
  for (const key of keys) {
    const rule = visibility(model.attributes[key]);
    if (rule === undefined) continue;
    const schema = rulesFor(key);
    if (!schema) continue;
    const condition = compileVisible(model, rule, available, "create");
    if (condition === undefined || condition === false) continue;
    rules.push({ if: condition, then: { properties: { [key]: schema } } });
  }
  return rules;
}

/** The raw `conditions.visible` rules of the given fields, for the `x-strapi-conditions` extension. */
export function conditionRules(
  model: Model,
  keys: string[],
): Record<string, unknown> | undefined {
  const rules = Object.fromEntries(
    keys.flatMap((key) => {
      const rule = visibility(model.attributes[key]);
      return rule === undefined ? [] : [[key, rule]];
    }),
  );
  return Object.keys(rules).length ? rules : undefined;
}
