// Type-level checks for the generated client. Compiled by the client test
// with tsconfig.generated.json, never run.
import type { StrapiCount } from "../.tmp/generated-client-test/index.js";

import {
  apiArticleArticleFind,
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
