import { parse, type Key, type Token } from "path-to-regexp";

import type { Result } from "../result";

export type PathParam = { name: string; pattern?: string };

/** Joins path parts under `/` without changing separators inside a part. */
export function joinPath(...parts: string[]): string {
  const body = parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return `/${body}`;
}

type NormalizedPath = {
  openapiPath: string;
  templateShape: string;
  pathParams: PathParam[];
};

const cleanPath = (path: string) =>
  path.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";

const DEFAULT_PATTERN = "[^\\/#\\?]+?";

function paramName(name: Key["name"]): string {
  if (typeof name === "string") return name;
  return name === 0 ? "wildcard" : `wildcard${name + 1}`;
}

/**
 * Converts a Strapi route path to one OpenAPI template. The result retains
 * parameter order and custom regex constraints.
 *
 * @returns An error result for invalid syntax, duplicate names, literal braces,
 * or optional or repeated segments.
 */
export function normalizePath(path: string): Result<NormalizedPath, Error> {
  let tokens: Token[];
  try {
    tokens = parse(path);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      error: new Error(`Invalid route syntax: ${detail}`, { cause }),
    };
  }

  let openapiPath = "";
  let templateShape = "";
  const pathParams: PathParam[] = [];
  for (const token of tokens) {
    if (
      typeof token === "string"
        ? /[{}]/.test(token)
        : /[{}]/.test(token.prefix) || /[{}]/.test(token.suffix)
    ) {
      return {
        ok: false,
        error: new Error(
          "Literal braces cannot be expressed in an OpenAPI path",
        ),
      };
    }
    if (typeof token === "string") {
      openapiPath += token;
      templateShape += token;
      continue;
    }
    if (!token.pattern) {
      const literal = token.prefix + token.suffix;
      if (token.modifier) {
        return {
          ok: false,
          error: new Error(
            `Optional or repeated path segment ${literal} cannot be expressed as one OpenAPI path`,
          ),
        };
      }
      openapiPath += literal;
      templateShape += literal;
      continue;
    }

    const name = paramName(token.name);
    if (token.modifier) {
      return {
        ok: false,
        error: new Error(
          `Optional or repeated path parameter ${name} cannot be expressed as one OpenAPI path`,
        ),
      };
    }
    if (pathParams.some((param) => param.name === name)) {
      return {
        ok: false,
        error: new Error(`Duplicate path parameter ${name}`),
      };
    }

    const param: PathParam = { name };
    if (token.pattern !== DEFAULT_PATTERN)
      param.pattern = `^(?:${token.pattern})$`;
    pathParams.push(param);
    openapiPath += `${token.prefix}{${name}}${token.suffix}`;
    templateShape += `${token.prefix}{}${token.suffix}`;
  }

  return {
    ok: true,
    value: {
      openapiPath: cleanPath(openapiPath),
      templateShape: cleanPath(templateShape),
      pathParams,
    },
  };
}
