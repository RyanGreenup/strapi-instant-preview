const {
  resolveLocalPointer,
} = require("../../dist/server/src/spec/pointer.js");

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const own = (object, key) =>
  object && Object.hasOwn(object, key) ? object[key] : undefined;
const valueType = (value) =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
const without = Symbol("remove property");
const tags = ["__component", "__type", "type"];
const blocksExtras = new Set(["indentLevel", "rel", "target"]);

function intersect(left, right) {
  return left.flatMap((a) =>
    right.map((b) => ({
      rules: [...a.rules, ...b.rules],
      blocks: a.blocks || b.blocks,
    })),
  );
}

function navigator(document, root) {
  const cache = new WeakMap();
  function expand(schema, active) {
    if (schema === false) return [];
    if (!isObject(schema) || active.has(schema))
      return [{ rules: [], blocks: false }];
    active.add(schema);
    const { $ref, allOf, anyOf, oneOf } = schema;
    let choices = [
      {
        rules: [schema],
        blocks: /^#\/components\/schemas\/StrapiBlocks(?:List)?Node$/.test(
          $ref,
        ),
      },
    ];
    if (typeof $ref === "string")
      choices = intersect(
        choices,
        expand(resolveLocalPointer(document, $ref, root), active),
      );
    for (const branch of allOf ?? [])
      choices = intersect(choices, expand(branch, active));
    for (const union of [anyOf, oneOf]) {
      if (union)
        choices = intersect(
          choices,
          union.flatMap((branch) => expand(branch, active)),
        );
    }
    active.delete(schema);
    return choices;
  }

  function alternatives(schema) {
    if (!isObject(schema)) return expand(schema, new Set());
    if (!cache.has(schema)) cache.set(schema, expand(schema, new Set()));
    return cache.get(schema);
  }

  function child(choice, key) {
    let result;
    for (const rule of choice?.rules ?? []) {
      const schema =
        typeof key === "number"
          ? (own(rule.prefixItems, key) ?? rule.items)
          : own(rule.properties, key);
      if (schema === undefined) continue;
      const next = alternatives(schema);
      result = result ? intersect(result, next) : next;
    }
    return result;
  }

  return { root: alternatives(root), child };
}

const isClosed = (rule) =>
  rule.additionalProperties === false &&
  !Object.keys(rule.patternProperties ?? {}).length;
const isDate = (rule) => rule.format === "date" || rule.format === "date-time";

function allowsScalar(rule, value) {
  const type = valueType(value);
  const types = Array.isArray(rule.type) ? rule.type : [rule.type];
  if (
    rule.type &&
    !types.includes(type) &&
    !(type === "null" && rule.nullable === true) &&
    !(type === "number" && Number.isInteger(value) && types.includes("integer"))
  )
    return false;
  if (value !== null && typeof value === "object") return true;
  return (
    (!Object.hasOwn(rule, "const") || rule.const === value) &&
    (!rule.enum || rule.enum.includes(value))
  );
}

function allowsShape(choice, value, invalidDate = false) {
  return choice.rules.every((rule) => {
    if (!allowsScalar(rule, value) || (invalidDate && isDate(rule)))
      return false;
    if (!isObject(value)) return true;
    if (rule.required?.some((key) => !Object.hasOwn(value, key))) return false;
    if (
      isClosed(rule) &&
      Object.keys(value).some(
        (key) => !Object.hasOwn(rule.properties ?? {}, key),
      )
    )
      return false;
    return tags.every((key) => {
      const property = own(rule.properties, key);
      return (
        !Object.hasOwn(value, key) ||
        !isObject(property) ||
        allowsScalar(property, value[key])
      );
    });
  });
}

function select(choices, value) {
  const matches = choices?.filter((choice) => allowsShape(choice, value));
  return matches?.length === 1 ? matches[0] : undefined;
}

function materialize(body, { path, value }) {
  if (!path.length) return structuredClone(value);
  const copy = structuredClone(body);
  let parent = copy;
  for (const key of path.slice(0, -1)) parent = parent[key];
  const key = path.at(-1);
  if (value === without) delete parent[key];
  else parent[key] = structuredClone(value);
  return copy;
}

function* responseMutations(body, document, schema, cap = 60, comparison) {
  if (!Number.isSafeInteger(cap) || cap <= 0) return;
  const guide = navigator(document, schema);
  const peer = comparison && navigator(comparison.document, comparison.schema);
  const sample = [];
  const path = [];
  let seen = 0;
  let seed = 0x63a3e71d;

  function record(kind, value, key) {
    const order = seen++;
    let slot = order;
    if (slot >= cap) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      slot = Math.floor((seed / 0x100000000) * seen);
    }
    if (slot < cap)
      sample[slot] = {
        kind,
        value,
        order,
        path: key === undefined ? [...path] : [...path, key],
      };
  }

  function visit(value, choices, peerChoices, inBlocks, parent) {
    const selected = select(choices, value);
    if (!selected) return;
    const other = select(peerChoices, value);
    inBlocks ||= selected.blocks || other?.blocks;
    const key = path.at(-1);
    function replace(kind, replacement, invalidDate = false) {
      if (
        value === replacement ||
        choices.some((choice) => allowsShape(choice, replacement, invalidDate))
      )
        return;
      if (
        parent?.choices.length > 1 &&
        tags.includes(key) &&
        parent.choices.some(
          (choice) =>
            choice !== parent.selected &&
            allowsShape(choice, { ...parent.value, [key]: replacement }),
        )
      )
        return;
      record(kind, replacement);
    }

    switch (valueType(value)) {
      case "string":
        replace("string-to-number", 1);
        if (key === "__component")
          replace("invalid-component", "__accuracy_invalid_component__");
        if (!inBlocks && selected.rules.some(isDate))
          replace("invalid-date", "not-a-date", true);
        break;
      case "number":
        replace("number-to-string", String(value));
        if (
          Number.isInteger(value) &&
          selected.rules.some(
            (rule) =>
              rule.type === "integer" ||
              (Array.isArray(rule.type) &&
                rule.type.includes("integer") &&
                !rule.type.includes("number")),
          )
        ) {
          replace("integer-to-float", 0.5);
        }
        break;
      case "boolean":
        replace("boolean-to-string", String(value));
        break;
      case "array":
        replace("array-to-object", {});
        for (const [index, item] of value.entries()) {
          path.push(index);
          visit(
            item,
            guide.child(selected, index),
            peer?.child(other, index),
            inBlocks,
          );
          path.pop();
        }
        break;
      case "object": {
        const context = { value, choices, selected };
        replace("object-to-string", "__accuracy_invalid_object__");
        for (const id of ["id", "documentId"]) {
          if (
            !Object.hasOwn(value, id) ||
            !selected.rules.some((rule) => rule.required?.includes(id))
          )
            continue;
          const removed = { ...value };
          delete removed[id];
          if (!choices.some((choice) => allowsShape(choice, removed)))
            record(`removed-${id}`, without, id);
        }
        if (
          !inBlocks &&
          !Object.hasOwn(value, "__type") &&
          selected.rules.some(isClosed) &&
          other?.rules.some(isClosed)
        ) {
          let unknownKey = "__accuracy_unknown__";
          while (
            Object.hasOwn(value, unknownKey) ||
            [...selected.rules, ...other.rules].some(
              (rule) => own(rule.properties, unknownKey) !== undefined,
            )
          ) {
            unknownKey += "_";
          }
          const extra = { ...value, [unknownKey]: true };
          if (
            !choices.some((choice) => allowsShape(choice, extra)) &&
            !peerChoices.some((choice) => allowsShape(choice, extra))
          ) {
            record("unknown-key", true, unknownKey);
          }
        }
        for (const childKey of Object.keys(value).sort()) {
          if (inBlocks && blocksExtras.has(childKey)) continue;
          path.push(childKey);
          visit(
            value[childKey],
            guide.child(selected, childKey),
            peer?.child(other, childKey),
            inBlocks,
            context,
          );
          path.pop();
        }
        break;
      }
    }
  }

  visit(body, guide.root, peer?.root, false);
  for (const mutation of sample.sort((a, b) => a.order - b.order)) {
    yield { kind: mutation.kind, body: materialize(body, mutation) };
  }
}

module.exports = { responseMutations };
