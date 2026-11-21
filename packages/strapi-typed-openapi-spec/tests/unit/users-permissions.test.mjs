import { test, expect } from "vitest";
import * as z from "zod/v4";

import usersPermissions from "../../dist/server/src/contract/users-permissions.js";
import builders from "../../dist/server/src/schemas/index.js";

const { createSchemas } = builders;
const { usersPermissionsContracts, userUid } = usersPermissions;

const userModel = {
  info: { singularName: "user" },
  attributes: {
    username: { type: "string", minLength: 3, required: true },
    email: { type: "email", minLength: 6, required: true },
    password: { type: "password", minLength: 6, private: true },
    confirmed: { type: "boolean" },
    resetPasswordToken: { type: "string", private: true },
  },
};
const schemas = createSchemas(
  z,
  { contentTypes: { [userUid]: userModel }, components: {} },
  { documentIdPattern: "loose" },
);
const route = { method: "POST", upstream: {} };

function registerBody(config) {
  const contract = usersPermissionsContracts(z, schemas, { config, userModel })(
    route,
    "auth.register",
  );
  return contract.request.body["application/json"];
}

test("register accepts the always-allowed keys and rejects any other key", () => {
  const body = registerBody({});
  const user = {
    username: "abc",
    email: "user@example.test",
    password: "secret",
  };
  expect(body.safeParse(user).success).toBe(true);
  expect(body.safeParse({ ...user, deviceId: "device" }).success).toBe(false);
  expect(body.safeParse({ ...user, username: "ab" }).success).toBe(false);
  expect(body.safeParse({ ...user, password: "x".repeat(72) }).success).toBe(
    true,
  );
  expect(body.safeParse({ ...user, password: "x".repeat(73) }).success).toBe(
    false,
  );
});

test("register.allowedFields take their schema from the user model input", () => {
  const body = registerBody({
    register: {
      allowedFields: [
        "confirmed",
        "resetPasswordToken",
        "nickname",
        "email",
        "",
        3,
      ],
    },
  });
  const user = {
    username: "abc",
    email: "user@example.test",
    password: "secret",
  };
  expect(Object.keys(body.shape).sort()).toEqual([
    "confirmed",
    "email",
    "nickname",
    "password",
    "resetPasswordToken",
    "username",
  ]);
  expect(body.safeParse({ ...user, confirmed: true }).success).toBe(true);
  expect(body.safeParse({ ...user, confirmed: "yes" }).success).toBe(false);
  expect(
    body.safeParse({ ...user, resetPasswordToken: 1, nickname: {} }).success,
  ).toBe(true);
});

test("user queries name the user model", () => {
  const table = usersPermissionsContracts(z, schemas, { userModel });
  for (const action of ["user.find", "user.findOne", "user.me", "user.count"]) {
    expect(
      table({ method: "GET", upstream: { request: {} } }, action).queryModel,
    ).toBe(userUid);
  }
  expect(
    table({ method: "POST", upstream: {} }, "user.create").queryModel,
  ).toBeUndefined();
});
