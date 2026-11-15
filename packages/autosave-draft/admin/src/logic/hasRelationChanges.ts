import { isPlainObject } from "./isPlainObject";

/** Find pending relation edits in nested `connect` or `disconnect` arrays. */
export const hasRelationChanges = (values: unknown): boolean => {
  if (Array.isArray(values)) {
    return values.some((value: unknown) => hasRelationChanges(value));
  }

  if (!isPlainObject(values)) {
    return false;
  }

  if (
    (Array.isArray(values["connect"]) && values["connect"].length > 0) ||
    (Array.isArray(values["disconnect"]) && values["disconnect"].length > 0)
  ) {
    return true;
  }

  return Object.values(values).some((value) => hasRelationChanges(value));
};
