export interface SaveError {
  /** Validation failures cannot succeed by retrying unchanged values. */
  isValidation: boolean;
  /** Strapi's message, when available. */
  message: string | undefined;
}

/** Read the admin API's flat error object or a thrown Error. */
export const describeSaveError = (error: unknown): SaveError => {
  const { name, message } = (
    typeof error === "object" && error !== null ? error : {}
  ) as {
    name?: unknown;
    message?: unknown;
  };

  return {
    isValidation: name === "ValidationError",
    message:
      typeof message === "string" && message !== "" ? message : undefined,
  };
};
