import type { ESTree } from "@oxlint/plugins";

/**
 * Mirrors the built-in eslint/init-declarations "always" mode: for-in/for-of
 * left declarations and for-statement init declarations count as initialized.
 * Every other parent is not a for-loop head, so the declaration remains
 * subject to the rule.
 */
export function isInitializedByForLoop(declaration: Readonly<ESTree.VariableDeclaration>): boolean {
  const { parent } = declaration;

  if (parent.type === "ForInStatement" || parent.type === "ForOfStatement") {
    return parent.left === declaration;
  }

  return parent.type === "ForStatement" && parent.init === declaration;
}
