import { parse, type AnyNode } from "acorn";
import { ancestor } from "acorn-walk";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { packageRequire, strapiRequire } from "../adapter";
import { controllerBaseline } from "./audit-baseline";

const controllers: readonly {
  pkg: string;
  entry?: string;
  optional?: boolean;
  files: readonly string[];
}[] = [
  {
    pkg: "@strapi/core",
    files: [
      "core-api/controller/collection-type.js",
      "core-api/controller/single-type.js",
    ],
  },
  {
    pkg: "@strapi/upload",
    entry: "strapi-server",
    files: ["controllers/content-api.js", "controllers/content-api-folder.js"],
  },
  {
    pkg: "@strapi/content-type-builder",
    entry: "strapi-server",
    files: ["controllers/components.js", "controllers/content-types.js"],
  },
  {
    pkg: "@strapi/email",
    entry: "strapi-server",
    files: ["controllers/email.js"],
  },
  {
    pkg: "@strapi/i18n",
    entry: "strapi-server",
    files: ["controllers/locales.js"],
  },
  {
    pkg: "@strapi/plugin-users-permissions",
    entry: "strapi-server",
    optional: true,
    files: [
      "controllers/auth.js",
      "controllers/permissions.js",
      "controllers/role.js",
      "controllers/user.js",
      "utils/oauth-connect/index.js",
      "controllers/validation/auth.js",
      "controllers/validation/user.js",
    ],
  },
];

export interface AuditResult {
  hits: string[];
  added: string[];
  removed: string[];
}

function memberName(node: AnyNode): string | undefined {
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier"
  ) {
    return node.property.name;
  }
}

function ctxMember(node: AnyNode): string | undefined {
  if (node.type !== "MemberExpression") return;
  const { object } = node;
  if (
    (object.type === "Identifier" && object.name === "ctx") ||
    memberName(object) === "ctx"
  ) {
    return memberName(node);
  }
}

function statusCode(node: AnyNode): string {
  if (
    node.type === "Literal" &&
    typeof node.value === "number" &&
    node.raw &&
    /^\d{3}$/.test(node.raw)
  ) {
    return node.raw;
  }
  return "dynamic";
}

const schemaRules: Record<string, true> = {
  required: true,
  noUnknown: true,
  email: true,
  oneOf: true,
  min: true,
  max: true,
  test: true,
};

function calleeName(node: AnyNode): string | undefined {
  return node.type === "Identifier" ? node.name : memberName(node);
}

function actionName(ancestors: readonly AnyNode[]): string | undefined {
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const node = ancestors[index];
    if (
      node.type === "Property" &&
      !node.computed &&
      node.key.type === "Identifier"
    )
      return node.key.name;
  }
}

function scanControllers(
  source: string,
  validation = false,
): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (marker: string) =>
    counts.set(marker, (counts.get(marker) ?? 0) + 1);
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
    allowReturnOutsideFunction: true,
  });
  ancestor(ast, {
    CallExpression(node, _state, ancestors) {
      switch (ctxMember(node.callee)) {
        case "send":
          add(
            `ctx.send ${node.arguments.length < 2 ? "200" : statusCode(node.arguments[1])}`,
          );
          break;
        case "created":
          add("ctx.created 201");
          break;
        case "redirect":
          add("ctx.redirect 302");
          break;
      }
      const name = calleeName(node.callee);
      if (name === "validateQuery")
        add(`validateQuery in ${actionName(ancestors) ?? "module"}`);
      if (
        name === "query" &&
        node.callee.type === "MemberExpression" &&
        memberName(node.callee.object) === "validate"
      ) {
        add("validate.query");
      }
      if (
        validation &&
        name !== undefined &&
        node.callee.type === "MemberExpression" &&
        Object.hasOwn(schemaRules, name)
      ) {
        add(`yup .${name}()`);
      }
    },
    NewExpression(node) {
      if (validation && calleeName(node.callee) === "TextEncoder")
        add("new TextEncoder");
    },
    AssignmentExpression(node) {
      if (node.operator === "=" && ctxMember(node.left) === "status")
        add(`ctx.status ${statusCode(node.right)}`);
    },
  });
  return counts;
}

/**
 * Scans selected Strapi source files for changes to response and validation
 * patterns without starting Strapi.
 *
 * @remarks
 * The audit excludes absent optional plugins from the baseline comparison.
 * A change in a pattern's occurrence count appears in both `added` and `removed`.
 */
export function auditControllers(
  appDir: string,
  baseline: readonly string[] = controllerBaseline,
): AuditResult {
  const appRequire = packageRequire(appDir);
  const coreRequire = strapiRequire(appDir);
  const hits: string[] = [];
  const installed = new Set<string>();
  for (const { pkg, entry, optional, files } of controllers) {
    const resolve = optional ? appRequire.resolve : coreRequire.resolve;
    if (optional) {
      try {
        resolve(`${pkg}/package.json`);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND")
          continue;
        throw cause;
      }
    }
    installed.add(pkg);
    const root = dirname(resolve(entry ? `${pkg}/${entry}` : pkg));
    for (const file of files) {
      const path = join(root, file);
      let source: string;
      try {
        source = readFileSync(path, "utf8");
      } catch (cause) {
        throw new Error(`Cannot audit installed Strapi controller ${path}`, {
          cause,
        });
      }
      let counts: Map<string, number>;
      try {
        counts = scanControllers(source, file.includes("/validation/"));
      } catch (cause) {
        throw new Error(`Cannot parse installed Strapi controller ${path}`, {
          cause,
        });
      }
      for (const [marker, count] of counts) {
        hits.push(`${pkg}/${file}: ${marker} x${count}`);
      }
    }
  }
  hits.sort();
  const expected = new Set(
    baseline.filter((hit) => {
      const end = hit.indexOf("/", hit.indexOf("/") + 1);
      return end !== -1 && installed.has(hit.slice(0, end));
    }),
  );
  const actual = new Set(hits);
  return {
    hits,
    added: hits.filter((hit) => !expected.has(hit)),
    removed: [...expected].filter((hit) => !actual.has(hit)).sort(),
  };
}
