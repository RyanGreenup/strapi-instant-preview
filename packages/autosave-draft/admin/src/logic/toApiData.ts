import { isPlainObject } from "./isPlainObject";

/**
 * Convert form values to a content manager update body.
 * Match its unexported `transformData`: replace relation display rows with their `apiData`.
 */
export const toApiData = (data: unknown): unknown => {
  if (Array.isArray(data)) {
    return data.map((item: unknown) => toApiData(item));
  }

  if (isPlainObject(data)) {
    if ("apiData" in data) {
      return data["apiData"];
    }

    const result: Record<string, unknown> = {};

    for (const key of Object.keys(data)) {
      result[key] = toApiData(data[key]);
    }

    return result;
  }

  return data;
};
