import type { ZodType } from "zod/v4";

import type { Model, Zod } from "../adapter";
import type { RouteEntry } from "../catalog";
import type { Schemas } from "../schemas";
import type { BuiltInContract } from "./built-ins";
import type { RequestOverlay } from "./index";

import { modelResponse } from "./model-response";

export const userUid = "plugin::users-permissions.user";
const rateLimited: Record<string, true> = {
  "auth.connect": true,
  "auth.register": true,
  "auth.forgotPassword": true,
  "auth.resetPassword": true,
  "auth.sendEmailConfirmation": true,
  "auth.changePassword": true,
};
const userQueries: Record<string, true> = {
  "user.count": true,
  "user.find": true,
  "user.findOne": true,
  "user.me": true,
};

export interface UsersPermissionsOptions {
  config?: unknown;
  userModel?: Model;
}

function allowedFields(config: unknown): string[] {
  const register =
    config !== null && typeof config === "object"
      ? (config as { register?: unknown }).register
      : undefined;
  const fields =
    register !== null && typeof register === "object"
      ? (register as { allowedFields?: unknown }).allowedFields
      : undefined;
  return Array.isArray(fields)
    ? fields.filter(
        (key): key is string => typeof key === "string" && key !== "",
      )
    : [];
}

/**
 * Uses the installed user model for username and password minimum lengths.
 * The registration body adds optional fields from `register.allowedFields`.
 */
export function usersPermissionsContracts(
  z: Zod,
  schemas: Schemas,
  { config, userModel }: UsersPermissionsOptions = {},
) {
  const token = z.string().min(1);
  const id = z.string().min(1);
  const email = z.email();
  const required = z.string().min(1);
  const minLength = (key: string) => {
    const value = userModel?.attributes[key]?.minLength;
    return typeof value === "number" && value > 1 ? value : 1;
  };
  const username = z.string().min(minLength("username"));
  const password = z
    .string()
    .min(minLength("password"))
    .max(72)
    .describe("At most 72 UTF-8 bytes.");
  const registerBase = { username, email, password };
  const deviceId = z.string().optional();
  const ok = z.object({ ok: z.literal(true) });
  const tokens = { jwt: token, refreshToken: token.optional() };
  const permissions = z.record(
    z.string(),
    z.object({
      controllers: z.record(
        z.string(),
        z.record(
          z.string(),
          z.object({
            enabled: z.boolean(),
            policy: z.string(),
          }),
        ),
      ),
    }),
  );
  // The role controllers return the role's own fields (no relations), then add
  // nb_users (find) or the permissions map (findOne).
  const role = () =>
    modelResponse(
      schemas,
      "plugin::users-permissions.role",
      [
        "id",
        "documentId",
        "name",
        "description",
        "type",
        "createdAt",
        "updatedAt",
        "publishedAt",
      ],
      "users-permissions role responses",
    );
  const session = z.object({
    id,
    deviceId: z.string().nullish(),
    deviceName: z.string().optional(),
    current: z.boolean(),
    loginAt: z.iso.datetime().optional(),
    lastActiveAt: z.iso.datetime().optional(),
  });
  const json = (body: ZodType): RequestOverlay => ({
    body: { "application/json": body },
  });
  const roleId = z.union([z.number().int().positive(), id]);
  const roleRef = z.union([
    z.object({ id: roleId }),
    z.object({ documentId: id }),
  ]);
  const roleLink = z.union([
    roleId,
    z.object({
      connect: z.array(roleRef).min(1),
      disconnect: z.array(roleRef).optional(),
    }),
  ]);
  const userBody = z.object({
    username,
    email,
    password,
    blocked: z.boolean().optional(),
    confirmed: z.boolean().optional(),
    role: roleLink,
  });
  const roleBody = z.object({
    name: z.string(),
    description: z.string().optional(),
    type: z.string().optional(),
    permissions: permissions.optional(),
  });
  const bodyWithPasswordConfirmation = {
    password,
    passwordConfirmation: required,
  };
  const list = {
    fields: z.union([z.string(), z.array(z.string())]).optional(),
    populate: z
      .union([
        z.string(),
        z.array(z.string()),
        z.record(z.string(), z.unknown()),
      ])
      .optional(),
  };

  const registerExtras = (): Record<string, ZodType> => {
    const extras = allowedFields(config).filter(
      (key) => !Object.hasOwn(registerBase, key),
    );
    if (!extras.length) return {};
    const shape = userModel ? schemas.input(userUid).shape : {};
    return Object.fromEntries(
      extras.map((key) => [
        key,
        (Object.hasOwn(shape, key) ? shape[key] : z.unknown()).optional(),
      ]),
    );
  };

  return (route: RouteEntry, action: string): BuiltInContract | undefined => {
    const user = () => schemas.document(userUid);
    const auth = () => z.object({ ...tokens, user: user() });
    const response = (
      body: BuiltInContract["response"],
      request?: RequestOverlay,
    ): BuiltInContract => {
      if (
        Object.hasOwn(rateLimited, action) ||
        (action === "auth.callback" && route.method === "POST")
      ) {
        if (body instanceof z.ZodType)
          body = { 200: body, 429: schemas.errorFor(429) };
        else body = { ...body, 429: schemas.errorFor(429) };
      }
      return {
        response: body,
        request,
        ...(Object.hasOwn(userQueries, action) && { queryModel: userUid }),
      };
    };
    switch (action) {
      case "auth.connect":
        return response(
          { 302: null },
          {
            query: {
              callback: z
                .string()
                .optional()
                .describe(
                  "Application callback URL, subject to the configured provider callback policy.",
                ),
              code: z.string().optional(),
              state: z.string().optional(),
              oauth_token: z.string().optional(),
              oauth_verifier: z.string().optional(),
            },
          },
        );
      case "auth.emailConfirmation":
        return response({ 302: null }, { query: { confirmation: token } });
      case "auth.refresh":
        return response(
          z.object(tokens),
          json(
            z
              .object({ refreshToken: token.optional() })
              .optional()
              .describe(
                "Omit the body when the refresh token is stored in a cookie.",
              ),
          ),
        );
      case "auth.logout":
        return response(
          ok,
          json(
            z
              .object({
                scope: z.enum(["current", "all"]).optional(),
                deviceId,
                refreshToken: token.optional(),
              })
              .optional(),
          ),
        );
      case "auth.getSessions":
        return response(z.object({ data: z.array(session) }));
      case "auth.revokeSession":
        return response(z.object({ data: z.strictObject({}) }), {
          params: { sessionId: id },
        });
      case "auth.callback":
        return response(
          auth(),
          route.method === "POST"
            ? json(
                z.object({
                  identifier: required,
                  password: required,
                  deviceId,
                }),
              )
            : route.upstream.request === undefined
              ? { params: { provider: id } }
              : undefined,
        );
      case "auth.register":
        return response(
          z.object({
            jwt: token.optional(),
            refreshToken: token.optional(),
            user: user(),
          }),
          json(z.strictObject({ ...registerBase, ...registerExtras() })),
        );
      case "auth.forgotPassword":
        return response(
          ok,
          route.upstream.request === undefined
            ? json(z.object({ email }))
            : undefined,
        );
      case "auth.sendEmailConfirmation":
        return response(
          z.object({ email: z.string(), sent: z.literal(true) }),
          route.upstream.request === undefined
            ? json(z.object({ email }))
            : undefined,
        );
      case "auth.resetPassword":
        return response(
          auth(),
          json(
            z.strictObject({ code: token, ...bodyWithPasswordConfirmation }),
          ),
        );
      case "auth.changePassword":
        return response(
          auth(),
          json(
            z.strictObject({
              currentPassword: required,
              ...bodyWithPasswordConfirmation,
            }),
          ),
        );
      case "user.count":
        return response(
          z.number().int().nonnegative(),
          route.upstream.request === undefined
            ? {
                query: {
                  filters: z.record(z.string(), z.unknown()).optional(),
                },
              }
            : undefined,
        );
      case "user.find":
        return response(
          z.array(user()),
          route.upstream.request === undefined ? { query: list } : undefined,
        );
      case "user.findOne":
        return response(
          { 200: user(), 204: null },
          route.upstream.request === undefined
            ? { params: { id }, query: list }
            : undefined,
        );
      case "user.me":
        return response(
          { 200: user(), 204: null },
          route.upstream.request === undefined ? { query: list } : undefined,
        );
      case "user.create":
        return response({ 201: user() }, json(userBody));
      case "user.update":
        return response(user(), {
          ...(route.upstream.request === undefined ? { params: { id } } : {}),
          ...json(userBody.partial()),
        });
      case "user.destroy":
        return response(
          { 200: user(), 204: null },
          route.upstream.request === undefined ? { params: { id } } : undefined,
        );
      case "role.find":
        return response(
          z.object({
            roles: z.array(
              role().extend({ nb_users: z.number().int().nonnegative() }),
            ),
          }),
        );
      case "role.findOne":
        return response(
          z.object({ role: role().extend({ permissions }) }),
          route.upstream.request === undefined ? { params: { id } } : undefined,
        );
      case "role.createRole":
        return response(ok, json(roleBody));
      case "role.updateRole":
        return response(ok, {
          ...(route.upstream.request === undefined
            ? { params: { role: id } }
            : {}),
          ...json(roleBody.partial()),
        });
      case "role.deleteRole":
        return response(
          ok,
          route.upstream.request === undefined
            ? { params: { role: id } }
            : undefined,
        );
      case "permissions.getPermissions":
        return response(z.object({ permissions }));
      default:
        return undefined;
    }
  };
}
