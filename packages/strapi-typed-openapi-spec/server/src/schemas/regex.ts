/**
 * Whether an attribute's `regex` means the same in Strapi and in JSON Schema.
 *
 * Strapi runs `new RegExp(source)` with no flags. JSON Schema validators such
 * as Ajv compile `pattern` in Unicode mode, where some escapes (for example
 * `\_` or `\:`) are syntax errors and `.` or a negated class match astral
 * characters differently. Only a pattern built from ASCII literals, ordinary
 * classes, groups, repetition, anchors and the escapes below is emitted as a
 * JSON Schema `pattern`. Any other pattern is still checked in Zod mode, and the
 * document carries the source in `x-strapi-regex`.
 *
 * Ported from the reference generator (strapi-openapi-spec-generator,
 * `lib/src/attribute-regex.ts`).
 */

const portableEscapes = String.raw`dswfnrtvx^$\.*+?()[]{}|/-`;

function portableOutsideClass(
  source: string,
  index: number,
  char: string | undefined,
): boolean {
  if (char === "[") return source[index + 1] !== "^";
  if (char === "(")
    return source[index + 1] !== "?" || source[index + 2] === ":";
  return char !== ".";
}

function portableTokens(source: string): boolean {
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
      const escaped = source[index];
      if (escaped === undefined || !portableEscapes.includes(escaped))
        return false;
    } else if (inClass) {
      inClass = char !== "]";
    } else if (portableOutsideClass(source, index, char)) {
      inClass = char === "[";
    } else {
      return false;
    }
  }
  return true;
}

export function portablePattern(source: string): boolean {
  if (/[^ -~]/u.test(source) || !portableTokens(source)) return false;
  try {
    // Compile only. Generation never runs a project-supplied expression.
    new RegExp(source);
    new RegExp(source, "u");
    return true;
  } catch {
    return false;
  }
}
