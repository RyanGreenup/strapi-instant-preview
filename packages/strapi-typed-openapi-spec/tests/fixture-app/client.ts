import createClient from "openapi-fetch";

import type { paths } from "./paths.js";

export async function fetchContractNumber(
  baseUrl: string,
  id: string,
): Promise<number> {
  const client = createClient<paths>({ baseUrl });
  const { data, response } = await client.GET("/contract/number/{id}", {
    params: { path: { id } },
  });
  if (!data || response.status !== 200)
    throw new Error(`Unexpected status ${response.status}`);
  return data.number;
}

type ArticleInput =
  paths["/articles"]["post"]["requestBody"]["content"]["application/json"]["data"];

export const article: ArticleInput = {
  title: "Typed article",
  color: "#623CAC",
  secret: "input-only",
};

type AssertFalse<T extends false> = T;
export type RejectNumericArticleTitle = AssertFalse<
  12 extends ArticleInput["title"] ? true : false
>;
