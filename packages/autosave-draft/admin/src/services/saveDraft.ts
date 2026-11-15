import { adminApi } from "@strapi/strapi/admin";

import { isPlainObject } from "../logic/isPlainObject";

/** Match the edit view's getDocument arguments to update its cache. */
interface DocumentArgs {
  collectionType: string;
  model: string;
  documentId?: string;
  params?: Record<string, unknown>;
}

interface SaveDraftArgs {
  url: string;
  data: unknown;
  documentArgs: DocumentArgs;
  refreshRelations: boolean;
}

interface SaveDraftResult {
  /** Refetch when no cached document matched documentArgs. */
  didUpdateCache: boolean;
}

interface DocumentResponse {
  data?: unknown;
  meta?: unknown;
}

// Content Manager adds these cache endpoints to the shared admin API at runtime.
interface CacheUtil {
  updateQueryData: (
    endpoint: string,
    args: DocumentArgs,
    recipe: (draft: DocumentResponse) => void,
  ) => unknown;
  invalidateTags: (tags: string[]) => unknown;
}

const util = adminApi.util as unknown as CacheUtil;

const draftAutosaveApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    // Updating the cache avoids refetching, which disables dynamic-zone fields and loses focus.
    saveDraft: build.mutation<SaveDraftResult, SaveDraftArgs>({
      // RTK Query passes four arguments to every custom query function.
      // eslint-disable-next-line max-params
      queryFn: async (
        { url, data, documentArgs, refreshRelations },
        api,
        _extra,
        baseQuery,
      ) => {
        const response = await baseQuery({
          url,
          method: "PUT",
          data,
          config: { params: documentArgs.params },
        });
        if (response.error) {
          return { error: response.error };
        }
        const { data: body } = response;
        const dispatch = api.dispatch as (thunk: unknown) => unknown;
        let didUpdateCache = false;
        if (isPlainObject(body) && isPlainObject(body["data"])) {
          const patch = dispatch(
            util.updateQueryData("getDocument", documentArgs, (draft) => {
              draft.data = body["data"];
              if (body["meta"] !== undefined) {
                draft.meta = body["meta"];
              }
            }),
          );
          didUpdateCache =
            isPlainObject(patch) &&
            Array.isArray(patch["patches"]) &&
            patch["patches"].length > 0;
        }
        if (refreshRelations) {
          dispatch(util.invalidateTags(["Relations"]));
        }
        return { data: { didUpdateCache } };
      },
    }),
  }),
  overrideExisting: true,
});

type SaveDraft = (args: SaveDraftArgs) => {
  unwrap: () => Promise<SaveDraftResult>;
};

export const useSaveDraftMutation: () => readonly [SaveDraft, unknown] =
  draftAutosaveApi.useSaveDraftMutation;

export type { DocumentArgs, SaveDraft };
