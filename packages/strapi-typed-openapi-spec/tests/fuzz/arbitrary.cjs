const fc = require("fast-check");
const { fullFormats } = require("ajv-formats/dist/formats");
const {
  resolveLocalPointer,
} = require("../../dist/server/src/spec/pointer.js");

const DOCUMENT_ID = "^[a-z][a-z0-9]{23}$";
const MAX_DEPTH = 4;

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}
const date = () =>
  fc.date({
    min: new Date("1970-01-01"),
    max: new Date("2100-01-01"),
    noInvalidDate: true,
  });
const formats = {
  "date-time": () => date().map((d) => d.toISOString()),
  date: () => date().map((d) => d.toISOString().slice(0, 10)),
  time: () =>
    fc
      .tuple(fc.nat(23), fc.nat(59), fc.nat(59), fc.nat(999))
      .map(([h, m, s, ms]) => `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`),
  email: () => fc.emailAddress(),
  uri: () => fc.webUrl(),
  uuid: () => fc.uuid(),
};

const MAX_PATH_SEGMENTS = 8;
const shallow = (s) =>
  s.split(",").every((item) => item.split(".").length <= MAX_PATH_SEGMENTS);

function stringArb(schema, opts) {
  const { minLength = 0, maxLength } = schema;
  if (schema.pattern) {
    const pattern = new RegExp(schema.pattern);
    let matching;
    try {
      matching = fc.stringMatching(
        new RegExp(schema.pattern.replace(/\(\?[!=][^()]*\)/g, "")),
      );
    } catch {
      matching = undefined;
    }
    if (matching) {
      const format = fullFormats[schema.format];
      const bounded = matching.filter(
        (s) =>
          pattern.test(s) &&
          (!(format instanceof RegExp) || format.test(s)) &&
          shallow(s) &&
          s.length >= minLength &&
          (maxLength === undefined || s.length <= maxLength),
      );
      if (schema.pattern === DOCUMENT_ID && opts.idPool.length) {
        return fc.oneof(fc.constantFrom(...opts.idPool), bounded);
      }
      return bounded;
    }
  }
  if (formats[schema.format]) return formats[schema.format]();
  return fc.string({
    unit: "binary",
    minLength,
    maxLength: maxLength ?? Math.max(minLength, 20),
  });
}

function numberArb(schema, integer) {
  let min = schema.minimum;
  let max = schema.maximum;
  if (typeof schema.exclusiveMinimum === "number")
    min = schema.exclusiveMinimum + (integer ? 1 : Number.EPSILON);
  if (typeof schema.exclusiveMaximum === "number")
    max = schema.exclusiveMaximum - (integer ? 1 : Number.EPSILON);
  if (integer) {
    return fc.integer({
      min: min ?? Number.MIN_SAFE_INTEGER,
      max: max ?? Number.MAX_SAFE_INTEGER,
    });
  }
  return fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
}

function objectArb(schema, doc, depth, opts) {
  const required = schema.required ?? [];
  const entries = Object.entries(schema.properties ?? {}).filter(
    ([key]) => depth <= MAX_DEPTH || required.includes(key),
  );
  if (
    !entries.length &&
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    if (depth > MAX_DEPTH) return fc.constant({});
    return fc.dictionary(
      fc.string({ minLength: 1, maxLength: 8 }),
      schemaArb(schema.additionalProperties, doc, depth + 1, opts),
      { maxKeys: 3 },
    );
  }
  const props = Object.fromEntries(
    entries.map(([key, value]) => [
      key,
      schemaArb(value, doc, depth + 1, opts),
    ]),
  );
  return fc.record(props, {
    requiredKeys: required.filter((key) => key in props),
  });
}

function arrayArb(schema, doc, depth, opts) {
  const minLength = schema.minItems ?? 0;
  const maxLength =
    depth > MAX_DEPTH
      ? minLength
      : Math.max(minLength, Math.min(schema.maxItems ?? 3, 3));
  const items = schema.items
    ? schemaArb(schema.items, doc, depth + 1, opts)
    : fc.jsonValue({ maxDepth: 1 });
  if (schema.uniqueItems)
    return fc.uniqueArray(items, {
      minLength,
      maxLength,
      comparator: "IsStrictlyEqual",
    });
  return fc.array(items, { minLength, maxLength });
}

const typed = {
  string: (schema, _doc, _depth, opts) => stringArb(schema, opts),
  integer: (schema) => numberArb(schema, true),
  number: (schema) => numberArb(schema, false),
  boolean: () => fc.boolean(),
  null: () => fc.constant(null),
  object: objectArb,
  array: arrayArb,
};

function schemaArb(schema, doc, depth = 0, opts = { idPool: [] }) {
  if (schema === true || schema === undefined)
    return fc.jsonValue({ maxDepth: 2 });
  if (typeof schema.$ref === "string") {
    const { $ref, ...rest } = schema;
    const cache = (opts.refCache ??= new Map());
    const key = `${$ref}@${depth}@${JSON.stringify(rest)}`;
    if (!cache.has(key)) {
      const target = resolveLocalPointer(doc, $ref);
      if (target === undefined)
        throw new Error(`Unresolved schema reference: ${$ref}`);
      let built;
      cache.set(
        key,
        fc
          .constant(null)
          .chain(
            () =>
              (built ??= schemaArb(
                { ...target, ...rest },
                doc,
                depth + 1,
                opts,
              )),
          ),
      );
    }
    return cache.get(key);
  }
  if ("const" in schema) return fc.constant(schema.const);
  if (schema.enum) return fc.constantFrom(...schema.enum);
  const union = schema.oneOf ?? schema.anyOf;
  if (union) {
    const { oneOf, anyOf, ...base } = schema;
    return fc.oneof(
      ...union.map((part) => schemaArb({ ...base, ...part }, doc, depth, opts)),
    );
  }
  if (schema.allOf) {
    return fc
      .tuple(...schema.allOf.map((part) => schemaArb(part, doc, depth, opts)))
      .map((parts) =>
        parts.every((p) => p && typeof p === "object" && !Array.isArray(p))
          ? Object.assign({}, ...parts)
          : parts[0],
      );
  }
  if (Array.isArray(schema.type)) {
    return fc.oneof(
      ...schema.type.map((type) =>
        schemaArb({ ...schema, type }, doc, depth, opts),
      ),
    );
  }
  const type =
    schema.type ??
    (schema.properties ? "object" : schema.items ? "array" : undefined);
  if (!type) return fc.jsonValue({ maxDepth: 2 });
  return typed[type](schema, doc, depth, opts);
}

function mutate(valueArb) {
  const anything = fc.jsonValue({ maxDepth: 2 });
  const key = fc.string({ minLength: 1, maxLength: 10 });
  return fc
    .tuple(valueArb, fc.nat(), key, anything, fc.nat(3))
    .map(([value, index, unknownKey, junk, how]) => {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        how === 3
      )
        return junk;
      const keys = Object.keys(value);
      const target = keys.length ? keys[index % keys.length] : unknownKey;
      const copy = { ...value };
      if (how === 0) copy[target] = junk;
      else if (how === 1) delete copy[target];
      else copy[unknownKey] = junk;
      if (
        how === 0 &&
        keys.length === 1 &&
        value[target] &&
        typeof value[target] === "object" &&
        !Array.isArray(value[target])
      ) {
        const inner = { ...value[target] };
        const innerKeys = Object.keys(inner);
        if (innerKeys.length) inner[innerKeys[index % innerKeys.length]] = junk;
        else inner[unknownKey] = junk;
        copy[target] = inner;
      }
      return copy;
    });
}

module.exports = { schemaArb, mutate };
