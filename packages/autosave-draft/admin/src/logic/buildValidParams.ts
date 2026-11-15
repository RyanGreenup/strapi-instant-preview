type Query = Record<string, unknown> & { plugins?: Record<string, unknown> };

/**
 * Lift plugin query options into request params, such as `plugins[i18n][locale]` into `locale`.
 * Match the content manager's unexported helper so both queries share the same cached document.
 */
export const buildValidParams = (
  query: Query | undefined,
): Record<string, unknown> | undefined => {
  if (!query) {
    return query;
  }

  const lifted: Record<string, unknown> = {};

  for (const options of Object.values(query.plugins ?? {})) {
    if (typeof options === "object" && options !== null) {
      Object.assign(lifted, options);
    }
  }

  const validParams = { ...query, ...lifted };

  delete validParams.plugins;

  return validParams;
};
