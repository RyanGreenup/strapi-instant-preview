// oxlint-disable import/no-default-export
// Default export required for plugins
import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Context, ESTree, VisitorWithHooks } from "@oxlint/plugins";
import { isInitializedByForLoop } from "./is-initialized-by-for-loop.ts";

const ruleName = {
  base: "solid-js-custom",
  rule: "init-declarations",
};
const plugin = eslintCompatPlugin({
  meta: {
    name: ruleName.base,
  },
  rules: {
    [ruleName.rule]: {
      createOnce,
      meta: {
        docs: {
          description:
            "Require variable initialization unless JSX assigns the variable through a ref",
        },
        messages: {
          initialized: "Variable '{{name}}' should be initialized on declaration.",
        },
        schema: [
          {
            enum: ["always"],
          },
        ],
        type: "suggestion",
      },
    },
  },
});

// Mirrors oxc's has_ambient_typescript_ancestor: any enclosing
// `declare namespace/module` or `declare global` block is ambient
function hasAmbientAncestor(node: Readonly<ESTree.Node>): boolean {
  let current: ESTree.Node | null = node.parent;

  while (current !== null) {
    if (current.type === "TSModuleDeclaration" && (current.declare || current.global)) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function createOnce(context: Context): VisitorWithHooks {
  const declarations: Readonly<ESTree.VariableDeclarator>[] = [];
  const refIdentifiers = new Set<number>();

  return {
    JSXAttribute(node): void {
      if (
        node.name.type !== "JSXIdentifier" ||
        node.name.name !== "ref" ||
        node.value?.type !== "JSXExpressionContainer" ||
        node.value.expression.type !== "Identifier"
      ) {
        return;
      }

      refIdentifiers.add(node.value.expression.start);
    },
    "Program:exit"(): void {
      for (const declaration of declarations) {
        const isAssignedByLaterRef =
          context.filename.endsWith(".tsx") &&
          context.sourceCode.scopeManager
            .getDeclaredVariables(declaration)
            .some((variable) =>
              variable.references.some(
                (reference) =>
                  reference.identifier.start > declaration.end &&
                  refIdentifiers.has(reference.identifier.start),
              ),
            );

        if (!isAssignedByLaterRef && declaration.id.type === "Identifier") {
          context.report({
            data: { name: declaration.id.name },
            messageId: "initialized",
            node: declaration,
          });
        }
      }
    },
    VariableDeclarator(node: Readonly<ESTree.VariableDeclarator>): void {
      // A definite assignment assertion (`let x!: T`) is TypeScript's documented
      // signal that x is assigned before use even though static analysis cannot see
      // the deferred assignment (TS 2.7, "Definite Assignment Assertions"). Treat it
      // as satisfying the rule, the same way an initializer would.
      // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-7.html#definite-assignment-assertions
      if (node.init !== null || node.definite === true || node.id.type !== "Identifier") {
        return;
      }

      const declaration = node.parent;

      if (
        declaration.type !== "VariableDeclaration" ||
        declaration.declare === true ||
        isInitializedByForLoop(declaration) ||
        hasAmbientAncestor(declaration)
      ) {
        return;
      }

      declarations.push(node);
    },
    before(): void {
      declarations.length = 0;
      refIdentifiers.clear();
    },
  };
}
export default plugin;
