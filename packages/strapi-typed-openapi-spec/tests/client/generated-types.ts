// Type-level checks for the generated client. Compiled by the client test
// with tsconfig.generated.json, never run.
import type { StrapiCount } from "../.tmp/generated-client-test/index.js";

import {
  apiArticleArticleFind,
  apiArticleArticleFindOne,
  bindClient,
  createCmsClient,
} from "../.tmp/generated-client-test/index.js";

/** Mutual assignability: precise enough for the unions checked here. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const expectType = <T extends true>(value: T): T => value;

const client = createCmsClient({ baseUrl: "http://cms.test" });
const plain = bindClient(client, { find: apiArticleArticleFind });
const populated = bindClient(
  client,
  { find: apiArticleArticleFind },
  { populated: true },
);

export async function check(): Promise<void> {
  const counted = await plain.find();
  const result = await populated.find();
  if (!counted.ok || !result.ok) return;
  type Article = (typeof result.value.data.data)[number];
  type CountedArticle = (typeof counted.value.data.data)[number];

  // Without `populated`, a relation may be a count.
  expectType<
    Equal<
      Extract<NonNullable<CountedArticle["topic"]>, StrapiCount>,
      StrapiCount
    >
  >(true);
  // With it, single and list relations never are, and lists stay lists.
  expectType<Equal<Extract<NonNullable<Article["topic"]>, StrapiCount>, never>>(
    true,
  );
  expectType<
    Equal<Extract<NonNullable<Article["topics"]>, StrapiCount>, never>
  >(true);
  expectType<
    NonNullable<Article["topics"]> extends readonly unknown[] ? true : false
  >(true);
  // Entries keep their own fields, and calls keep their option types.
  expectType<Equal<Article["title"], string | null | undefined>>(true);
  await populated.find(undefined, { signal: AbortSignal.timeout(1) });
  await populated.find(undefined, { fetch: undefined });
}

/** Whether `Key` is a key of every member of `Document`. */
type Has<Document, Key extends PropertyKey> = Key extends keyof Document
  ? true
  : false;
/** Whether `Key` is required on `Document`. */
type Required<Document, Key extends keyof Document> =
  {} extends Pick<Document, Key> ? false : true;

const articles = bindClient(client, {
  find: apiArticleArticleFind,
  findOne: apiArticleArticleFindOne,
});

export async function checkPopulate(): Promise<void> {
  // An object tree: named keys are required and never a count, the rest absent.
  const named = await articles.find({ populate: { topic: true } });
  if (!named.ok) return;
  type Named = (typeof named.value.data.data)[number];
  expectType<Required<Named, "topic">>(true);
  expectType<Equal<Extract<Named["topic"], StrapiCount>, never>>(true);
  expectType<Equal<Has<Named, "cover">, false>>(true);
  expectType<Equal<Has<Named, "topics">, false>>(true);
  // Scalars are untouched.
  expectType<Equal<Named["title"], string | null | undefined>>(true);
  // `topic: true` populates one level: the topic's own relation is absent.
  expectType<Equal<Has<NonNullable<Named["topic"]>, "parent">, false>>(true);

  // Nested populate, by object and by dot path.
  const nested = await articles.find({
    populate: { topic: { populate: { parent: true } } },
  });
  const dotted = await articles.find({ populate: ["topic.parent"] });
  if (!nested.ok || !dotted.ok) return;
  type Nested = NonNullable<(typeof nested.value.data.data)[number]["topic"]>;
  type Dotted = NonNullable<(typeof dotted.value.data.data)[number]["topic"]>;
  expectType<Required<Nested, "parent">>(true);
  expectType<Required<Dotted, "parent">>(true);
  expectType<Equal<Has<NonNullable<Nested["parent"]>, "parent">, false>>(true);

  // Strings: one name, a comma list, and "*".
  const one = await articles.findOne("id", { populate: "cover" });
  const listed = await articles.find({ populate: "cover,topics" });
  const all = await articles.find({ populate: "*" });
  if (!one.ok || !listed.ok || !all.ok) return;
  type One = typeof one.value.data.data;
  type Listed = (typeof listed.value.data.data)[number];
  type All = (typeof all.value.data.data)[number];
  expectType<Required<One, "cover">>(true);
  expectType<Equal<Has<One, "topic">, false>>(true);
  expectType<Required<Listed, "cover">>(true);
  expectType<Required<Listed, "topics">>(true);
  expectType<Equal<Has<Listed, "topic">, false>>(true);
  expectType<Required<All, "sections">>(true);
  expectType<Required<All, "localizations">>(true);

  // A count where the contract allows one; elsewhere Strapi sends entries.
  const counted = await articles.find({
    populate: { topics: { count: true }, leadTopic: { count: true } },
  });
  if (!counted.ok) return;
  type Counted = (typeof counted.value.data.data)[number];
  expectType<Equal<Counted["topics"], StrapiCount>>(true);
  expectType<Equal<Extract<Counted["leadTopic"], StrapiCount>, never>>(true);
  expectType<Required<NonNullable<Counted["leadTopic"]>, "documentId">>(true);

  // A dynamic zone keeps every component type.
  const zone = await articles.find({
    populate: { sections: { on: { "content.note": { fields: ["message"] } } } },
  });
  if (!zone.ok) return;
  type Section = NonNullable<
    (typeof zone.value.data.data)[number]["sections"]
  >[number];
  expectType<Equal<Section["__component"], "content.note" | "content.quote">>(
    true,
  );

  // A tree the types cannot read keeps the generated response.
  const tree: Parameters<typeof apiArticleArticleFind>[0] = {
    populate: { topic: true },
  };
  const wide = await articles.find(tree);
  const generated = await plain.find();
  if (!wide.ok || !generated.ok) return;
  expectType<
    Equal<
      (typeof wide.value.data.data)[number]["topic"],
      (typeof generated.value.data.data)[number]["topic"]
    >
  >(true);
  // So does forwarding an operation's own parameters.
  const forward = (...args: Parameters<typeof apiArticleArticleFind>) =>
    articles.find(...args);
  const forwarded = await forward({ populate: "topic" });
  if (!forwarded.ok) return;
  expectType<
    Equal<Required<(typeof forwarded.value.data.data)[number], "topic">, false>
  >(true);

  // Keys that are not relations are rejected.
  // @ts-expect-error title is not populatable
  await articles.find({ populate: { title: true } });

  // `populated` still removes counts from a tree's response.
  const strict = bindClient(
    client,
    { find: apiArticleArticleFind },
    { populated: true },
  );
  const strictAll = await strict.find({ populate: "*" });
  if (!strictAll.ok) return;
  expectType<
    Equal<
      Extract<
        (typeof strictAll.value.data.data)[number]["topics"],
        StrapiCount
      >,
      never
    >
  >(true);
}
