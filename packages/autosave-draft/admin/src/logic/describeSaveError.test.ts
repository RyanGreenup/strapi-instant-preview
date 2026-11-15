import { describe, expect, it, vi } from "vitest";

import { describeSaveError } from "./describeSaveError";

vi.setConfig({ testTimeout: 1000 });

describe("describeSaveError", () => {
  it("reads a validation error from the admin API", () => {
    const error = {
      status: 400,
      name: "ValidationError",
      message: "title must be at most 255 characters",
      details: {},
    };

    expect(describeSaveError(error)).toStrictEqual({
      isValidation: true,
      message: "title must be at most 255 characters",
    });
  });

  it("reads a thrown Error", () => {
    expect(describeSaveError(new TypeError("Failed to fetch"))).toStrictEqual({
      isValidation: false,
      message: "Failed to fetch",
    });
  });

  it("reads other server errors without calling them validation errors", () => {
    expect(
      describeSaveError({ name: "ForbiddenError", message: "Forbidden" }),
    ).toStrictEqual({
      isValidation: false,
      message: "Forbidden",
    });
  });

  it("gives no message when there is none", () => {
    const missingError = undefined;

    expect(describeSaveError(missingError)).toStrictEqual({
      isValidation: false,
      message: undefined,
    });
    expect(describeSaveError({ response: { data: "oops" } })).toStrictEqual({
      isValidation: false,
      message: undefined,
    });
    expect(
      describeSaveError({ name: "UnknownError", message: "" }),
    ).toStrictEqual({
      isValidation: false,
      message: undefined,
    });
  });
});
