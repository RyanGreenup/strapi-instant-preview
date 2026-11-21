import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";
import { expect, test } from "vitest";
import * as z from "zod/v4";

import filters from "../../dist/server/src/spec/filters.js";
import modelFields from "../../dist/server/src/spec/model-fields.js";
import conversion from "../../dist/server/src/spec/schemas.js";

const { createFilters } = filters;
const { createModelFields } = modelFields;
const { schemaConverter } = conversion;
const article = "api::article.article";
const project = "api::project.project";
const file = "plugin::upload.file";
const image = "shared.image";
const model = (singularName, attributes, options) => ({
  info: { singularName },
  attributes,
  options,
});
const models = {
  contentTypes: {
    [article]: model(
      "article",
      {
        title: { type: "string", minLength: 5 },
        slug: { type: "uid", regex: "^[a-z0-9-]+$" },
        kind: { type: "enumeration", enum: ["article", "external"] },
        date: { type: "date" },
        publishedAt: { type: "datetime" },
        body: { type: "blocks" },
        draft: { type: "boolean" },
        ranking: { type: "integer" },
        measurement: { type: "decimal" },
        views: { type: "biginteger" },
        image: { type: "component", component: image },
        blocks: { type: "dynamiczone", components: [image] },
        projects: { type: "relation", relation: "manyToMany", target: project },
        attachments: {
          type: "relation",
          relation: "morphMany",
          target: file,
          morphBy: "related",
        },
        owner: { type: "relation", relation: "morphToOne", target: project },
        secret: { type: "password" },
        hidden: { type: "string", private: true },
        editorNote: { type: "string" },
        internal: { type: "boolean" },
      },
      { privateAttributes: ["editorNote"] },
    ),
    [project]: model("project", {
      title: { type: "string" },
      nextProject: { type: "relation", relation: "manyToOne", target: project },
      articles: { type: "relation", relation: "manyToMany", target: article },
    }),
    [file]: model("file", {
      name: { type: "string" },
      size: { type: "decimal" },
      related: { type: "relation", relation: "morphToMany" },
    }),
  },
  components: {
    [image]: model("image", {
      caption: { type: "string" },
      image: { type: "media" },
    }),
  },
  privateAttributes: ["internal"],
};

function validators(uid, source = models) {
  const registry = z.registry();
  const filter = createFilters(z, createModelFields(source), registry);
  const components = Object.create(null);
  const convert = schemaConverter(z, registry, components);
  const schema = convert(filter(uid).optional(), "input", "filters");
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const validate = ajv.compile({
    ...schema,
    components: { schemas: components },
  });
  function accepts(value, valid = true) {
    expect(filter(uid).safeParse(value).success, JSON.stringify(value)).toBe(
      valid,
    );
    expect(
      validate(value),
      `${JSON.stringify(value)}: ${ajv.errorsText(validate.errors)}`,
    ).toBe(valid);
  }
  return { accepts, filter, components };
}

test("filters type scalar operators and accept native clients and qs input operands", () => {
  const { accepts } = validators(article);
  accepts({
    id: { $in: [1, "2"] },
    documentId: { $eq: "arbitrary-document-id" },
    title: { $containsi: "A", $not: { $startsWith: "Z" } },
    slug: { $contains: "not a full slug" },
    kind: { $in: ["article", "external"], $startsWithi: "EXT" },
    date: { $between: ["2024-01-01", "2024-12-31"] },
    publishedAt: { $gte: "2024-01-01T10:25:00+10:00" },
    draft: { $in: ["TRUE", "f", "1", 0, false] },
    ranking: { $gte: "10" },
    measurement: { $between: ["-1.25e1", 1.4] },
    views: { $gt: "9223372036854775806" },
    body: { $notNull: "false" },
  });
  accepts({
    id: { $in: "4" },
    date: "2024-11-21",
    publishedAt: { $lte: "1704067200000" },
  });
  accepts({ publishedAt: { $lte: "2024-01-01T10:25" } });
  accepts({
    id: ["1", "2"],
    title: { $eq: ["one", "two"] },
    documentId: { $ne: "" },
  });
  accepts({ documentId: { $ne: null } }, false);
  accepts({ date: { $eq: "" } }, false);
  accepts({ title: { $is: "bad operator" } }, false);
  accepts({ title: { $and: ["not legal at field level"] } }, false);
  accepts({ measurement: { $gt: "NaN" } }, false);
  accepts({ draft: { $eq: "yes" } }, false);
  accepts({ publishedAt: { $notNull: "banana" } }, false);
  accepts({ kind: { $in: ["other"] } }, false);
  accepts({ date: { $between: ["2024-01-01"] } }, false);
  accepts(
    { date: { $between: ["2024-01-01", "2024-12-31", "2025-01-01"] } },
    false,
  );
  accepts({ date: { $gte: "yesterday" } }, false);
});

test("logical filters follow recursive relations, components, and media targets", () => {
  const { accepts } = validators(article);
  accepts({
    $and: [
      { $or: [{ title: "Example" }, { $not: { kind: "external" } }] },
      {
        projects: {
          nextProject: {
            articles: { documentId: { $eq: "related-document" } },
          },
        },
      },
      {
        projects: {
          $or: [{ title: { $endsWithi: "park" } }, { id: { $gte: "2" } }],
        },
      },
      {
        image: {
          caption: { $contains: "Site" },
          image: { size: { $lte: "100.5" } },
        },
      },
      { attachments: { name: { $contains: ".pdf" } } },
      { projects: { $notNull: "true" } },
    ],
  });
  accepts({ projects: "5", image: { image: { id: "12" } } });
  accepts({ projects: { $in: ["5", 6] } });
  accepts(
    { projects: { $eq: "5", title: "cannot mix keys at relation root" } },
    false,
  );
  accepts({ projects: { $eq: "5", $notNull: true } }, false);
  accepts({ projects: { $not: { title: "not a join-ID predicate" } } }, false);
  accepts({ projects: { date: "2024-01-01" } }, false);
  accepts({ image: { documentId: "components do not have one" } }, false);
  accepts({ $or: { title: "groups must be arrays" } }, false);
  accepts([{ title: "not a core document-service filter object" }], false);
});

test("filters reject attributes and operators excluded by core traversal", () => {
  const { accepts } = validators(article);
  const equality = { $eq: "example" };
  for (const key of [
    "unknown",
    "secret",
    "hidden",
    "editorNote",
    "internal",
    "owner",
    "blocks",
  ]) {
    accepts({ [key]: equality }, false);
    accepts({ projects: { articles: { [key]: equality } } }, false);
  }
  accepts({ body: { $jsonSupersetOf: "[]" } }, false);
});

test("filters reject an unknown model", () => {
  const filter = createFilters(z, createModelFields(models), z.registry());
  expect(() => filter("api::missing.missing")).toThrow(
    "Cannot build filters for unknown Strapi model api::missing.missing",
  );
});

test("filters do not synthesize identifiers excluded by model or global privacy settings", () => {
  const { accepts } = validators(article, {
    contentTypes: {
      [article]: model(
        "article",
        { title: { type: "string" } },
        { privateAttributes: ["documentId"] },
      ),
    },
    components: {},
    privateAttributes: ["id"],
  });
  accepts({ title: "example" });
  accepts({ id: 1 }, false);
  accepts({ documentId: "example" }, false);
});

test("different models with the same singular name retain distinct recursive components", () => {
  const other = "plugin::other.project";
  const source = {
    ...models,
    contentTypes: {
      [project]: model("project", {
        title: { type: "string" },
        other: { type: "relation", relation: "manyToOne", target: other },
      }),
      [other]: model("project", {
        label: { type: "string" },
        original: { type: "relation", relation: "manyToOne", target: project },
      }),
    },
  };
  const { accepts, filter, components } = validators(project, source);
  const keys = Object.keys(components).filter((key) =>
    key.startsWith("StrapiQueryFilter_Model_"),
  );
  expect(keys).toHaveLength(2);
  expect(filter(project)).toBe(filter(project));
  accepts({
    title: "first",
    other: { label: "second", original: { title: "first again" } },
  });
  accepts({ other: { title: "belongs to a different model" } }, false);
});
