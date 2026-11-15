// Adapted from oxc's crates/oxc_linter/src/rules/eslint/init_declarations.rs
// test suite, restricted to the "always" mode this plugin implements, plus
// cases for the SolidJS JSX ref exemption the plugin adds on top.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isRecord, isUnknownArray, parseJson } from "../scripts/generate/guards.ts";

interface LintCase {
  code: string;
  errors: number;
  ext?: "ts" | "tsx";
  name: string;
}

interface OxlintDiagnostic {
  code: string;
  filename: string;
  message: string;
}

const RULE_CODE = "solid-js-custom(init-declarations)";

const passCases: LintCase[] = [
  { code: "var foo = null;", errors: 0, name: "var initialized to null" },
  { code: "foo = true;", errors: 0, name: "bare assignment without declaration" },
  { code: "var foo = 1, bar = false, baz = {};", errors: 0, name: "multiple initialized vars" },
  {
    code: "function foo() { var foo = 0; var bar = []; }",
    errors: 0,
    name: "initialized vars in function",
  },
  { code: "var fn = function() {};", errors: 0, name: "function expression assignment" },
  { code: "var foo = bar = 2;", errors: 0, name: "chained assignment" },
  { code: "for (var i = 0; i < 1; i++) {}", errors: 0, name: "for statement init" },
  { code: "for (var i; i < 1; i++) {}", errors: 0, name: "uninitialized for statement init" },
  { code: "for (var foo in []) {}", errors: 0, name: "for-in left declaration" },
  { code: "for (var foo of []) {}", errors: 0, name: "for-of left declaration" },
  { code: "let a = true;", errors: 0, name: "initialized let" },
  { code: "const a = {};", errors: 0, name: "initialized const" },
  { code: "function f() { using a = foo(); }", errors: 0, name: "using declaration" },
  {
    code: "async function f() { await using a = foo(); }",
    errors: 0,
    name: "await using declaration",
  },
  {
    code: "function foo() { let a = 1, b = false; if (a) { let c = 3, d = null; } }",
    errors: 0,
    name: "initialized lets in nested blocks",
  },
  {
    code: "function foo() { const a = 1, b = true; if (a) { const c = 3, d = null; } }",
    errors: 0,
    name: "initialized consts in nested blocks",
  },
  {
    code: "function foo() { let a = 1; const b = false; var c = true; }",
    errors: 0,
    name: "mixed initialized kinds",
  },
  { code: "declare const foo: number;", errors: 0, name: "declare const" },
  {
    code: "declare namespace myLib { let numberOfGreetings: number; }",
    errors: 0,
    name: "let inside declare namespace",
  },
  {
    code: "type GreetingLike = string | (() => string) | Greeter;",
    errors: 0,
    name: "type alias only",
  },
  {
    code: "namespace myLib { let numberOfGreetings: number = 2; }",
    errors: 0,
    name: "initialized let inside plain namespace",
  },
  {
    code: [
      "declare namespace myLib1 {",
      "  const foo: number;",
      "  namespace myLib2 {",
      "    let bar: string;",
      "    namespace myLib3 {",
      "      let baz: object;",
      "    }",
      "  }",
      "}",
    ].join("\n"),
    errors: 0,
    name: "nested namespaces under declare",
  },
  {
    code: [
      "declare module 'pkg' {",
      "  global {",
      "    var nestedGlobal: string;",
      "  }",
      "}",
    ].join("\n"),
    errors: 0,
    name: "global block inside declare module",
  },
  {
    code: [
      "function Component() {",
      "  let el;",
      "  return <div ref={el} />;",
      "}",
      "export default Component;",
    ].join("\n"),
    errors: 0,
    ext: "tsx",
    name: "uninitialized variable assigned through JSX ref",
  },
  {
    code: [
      "function Component() {",
      "  let first;",
      "  let second;",
      "  return <><div ref={first} /><div ref={second} /></>;",
      "}",
    ].join("\n"),
    errors: 0,
    ext: "tsx",
    name: "multiple variables assigned through their own JSX refs",
  },
  // Definite assignment assertion, TypeScript 2.7 "Definite Assignment Assertions":
  // `let x!: T` tells the type system (and by extension this rule) that x is
  // assigned before use even though static analysis cannot see the deferred
  // assignment. This is the documented signal an Astro integration uses when it
  // declares closure state that a later hook callback fills in.
  // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-7.html#definite-assignment-assertions
  {
    code: "let docsDirectory!: string;",
    errors: 0,
    name: "definite assignment assertion on let",
  },
  // The Astro integration shape the assertion exists for: closure state declared in
  // an outer scope and assigned inside a later callback. TS 2.7's own example assigns
  // the variable inside a separate function, exactly like this hook does.
  // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-7.html#definite-assignment-assertions
  {
    code: [
      "function makeIntegration() {",
      "  let docsPath!: string;",
      '  return { setup() { docsPath = "/x"; return docsPath; } };',
      "}",
    ].join("\n"),
    errors: 0,
    name: "definite assignment assertion filled by a later callback",
  },
];

const failCases: LintCase[] = [
  { code: "var foo;", errors: 1, name: "uninitialized var" },
  { code: "for (var a in []) var foo;", errors: 1, name: "uninitialized var in for-in body" },
  { code: "var foo, bar = false, baz;", errors: 2, name: "partially initialized list" },
  {
    code: "function foo() { var foo = 0; var bar; }",
    errors: 1,
    name: "uninitialized var in function",
  },
  {
    code: "function foo() { var foo; var bar = foo; }",
    errors: 1,
    name: "var initialized from uninitialized var",
  },
  { code: "let a;", errors: 1, name: "uninitialized let" },
  {
    code: "function foo() { let a = 1, b; if (a) { let c = 3, d = null; } }",
    errors: 1,
    name: "uninitialized let in list",
  },
  {
    code: "function foo() { let a; const b = false; var c; }",
    errors: 2,
    name: "mixed kinds with two uninitialized",
  },
  { code: "let arr: string;", errors: 1, name: "uninitialized let with type annotation" },
  {
    code: "namespace myLib { let numberOfGreetings: number; }",
    errors: 1,
    name: "uninitialized let inside plain namespace",
  },
  {
    code: [
      "namespace myLib1 {",
      "  let foo: number;",
      "  namespace myLib2 {",
      "    let bar: string;",
      "    namespace myLib3 {",
      "      let baz: object;",
      "    }",
      "  }",
      "}",
    ].join("\n"),
    errors: 3,
    name: "nested plain namespaces",
  },
  {
    code: [
      "declare namespace myLib {",
      "  let valueInside: number;",
      "}",
      "let valueOutside: number;",
    ].join("\n"),
    errors: 1,
    name: "uninitialized let outside declare namespace",
  },
  {
    code: [
      "function Component() {",
      "  let el;",
      "  return <div id={el} />;",
      "}",
      "export default Component;",
    ].join("\n"),
    errors: 1,
    ext: "tsx",
    name: "uninitialized variable used in non-ref JSX attribute",
  },
  {
    code: [
      "function Component() {",
      "  let el;",
      "  return <div />;",
      "}",
      "export default Component;",
    ].join("\n"),
    errors: 1,
    ext: "tsx",
    name: "uninitialized variable never assigned through ref",
  },
  {
    code: [
      "function Component() {",
      "  let outer;",
      "  {",
      "    let outer = document.createElement('div');",
      "    return <div ref={outer} />;",
      "  }",
      "}",
    ].join("\n"),
    errors: 1,
    ext: "tsx",
    name: "same-named ref in a nested scope does not initialize outer binding",
  },
  {
    code: [
      "function Component() {",
      "  const view = <div ref={element} />;",
      "  let element;",
      "  return view;",
      "}",
    ].join("\n"),
    errors: 1,
    ext: "tsx",
    name: "JSX ref before declaration does not initialize later binding",
  },
  {
    code: [
      "function Component() {",
      "  let element;",
      "  return <div ref={(node) => { element = node; }} />;",
      "}",
    ].join("\n"),
    errors: 1,
    ext: "tsx",
    name: "callback ref does not match direct ref pattern",
  },
  {
    code: [
      "function Component() {",
      "  let holder;",
      "  return <div ref={holder.element} />;",
      "}",
    ].join("\n"),
    errors: 1,
    ext: "tsx",
    name: "member-expression ref does not match direct ref pattern",
  },
  {
    code: [
      "function Component() {",
      "  let first;",
      "  let second;",
      "  return <div ref={first} data-second={second} />;",
      "}",
    ].join("\n"),
    errors: 1,
    ext: "tsx",
    name: "each uninitialized variable requires its own matching ref",
  },
  // Control for the definite-assignment exemption: the same closure state WITHOUT the
  // `!` assertion is still flagged, so the exemption keys strictly on the assertion and
  // does not silently pass every deferred assignment.
  {
    code: [
      "function makeIntegration() {",
      "  let docsPath: string;",
      '  return { setup() { docsPath = "/x"; return docsPath; } };',
      "}",
    ].join("\n"),
    errors: 1,
    name: "deferred assignment without definite assertion is still flagged",
  },
];

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const allCases = [...passCases, ...failCases];
const diagnosticsByFile = new Map<string, OxlintDiagnostic[]>();

function caseFilename(lintCase: LintCase, index: number): string {
  return `case-${String(index)}.${lintCase.ext ?? "ts"}`;
}

function runOxlint(cwd: string): OxlintDiagnostic[] {
  const oxlintBin = join(packageRoot, "node_modules", ".bin", "oxlint");

  const result = spawnSync(oxlintBin, ["--format", "json", "."], { cwd, encoding: "utf8" });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.signal !== null) {
    throw new Error(`Oxlint terminated by signal ${result.signal}`);
  }
  // This fixture intentionally contains lint failures, for which oxlint exits 1.
  // Any stderr output indicates a configuration, parser, or plugin runtime failure.
  if (result.status !== 1 || result.stderr.trim() !== "") {
    throw new Error(
      `Oxlint failed unexpectedly (status ${String(result.status)}):\n${result.stderr || result.stdout}`,
    );
  }

  return readDiagnostics(result.stdout);
}

/** Pull the diagnostics array out of oxlint's JSON report. */
function readDiagnostics(stdout: string): OxlintDiagnostic[] {
  const report = parseJson(stdout);
  if (!isRecord(report) || !isUnknownArray(report["diagnostics"])) {
    throw new Error("Oxlint reported no diagnostics array");
  }
  if (!report["diagnostics"].every(isOxlintDiagnostic)) {
    throw new Error("Oxlint reported an invalid diagnostic");
  }

  return [...report["diagnostics"]];
}

function isOxlintDiagnostic(value: unknown): value is OxlintDiagnostic {
  return (
    isRecord(value) &&
    typeof value["code"] === "string" &&
    typeof value["filename"] === "string" &&
    typeof value["message"] === "string"
  );
}

describe("readDiagnostics", () => {
  it("rejects malformed diagnostic entries", () => {
    expect(() => readDiagnostics('{"diagnostics":[{}]}')).toThrow(
      "Oxlint reported an invalid diagnostic",
    );
  }, 10_000);
});

/** Diagnostics oxlint reported for one fixture file, split by whether they are ours. */
function partitionDiagnostics(filename: string): {
  rule: OxlintDiagnostic[];
  other: OxlintDiagnostic[];
} {
  const diagnostics = diagnosticsByFile.get(filename) ?? [];

  return {
    rule: diagnostics.filter((diagnostic) => diagnostic.code === RULE_CODE),
    other: diagnostics.filter((diagnostic) => diagnostic.code !== RULE_CODE),
  };
}

describe("solid-js-custom/init-declarations", () => {
  // A const holder, so the temp directory can be created in the hook that owns it.
  const fixture = { dir: "" };

  beforeAll(() => {
    fixture.dir = mkdtempSync(join(tmpdir(), "ref-pattern-test-"));

    const config = {
      categories: { correctness: "off" },
      jsPlugins: [join(packageRoot, "src", "plugins", "solid-ref-pattern", "index.ts")],
      rules: { "solid-js-custom/init-declarations": ["error", "always"] },
    };
    writeFileSync(join(fixture.dir, ".oxlintrc.json"), JSON.stringify(config));

    for (const [index, lintCase] of allCases.entries()) {
      writeFileSync(join(fixture.dir, caseFilename(lintCase, index)), `${lintCase.code}\n`);
    }

    for (const diagnostic of runOxlint(fixture.dir)) {
      const existing = diagnosticsByFile.get(diagnostic.filename) ?? [];
      existing.push(diagnostic);
      diagnosticsByFile.set(diagnostic.filename, existing);
    }
  });

  afterAll(() => {
    rmSync(fixture.dir, { force: true, recursive: true });
  });

  it.each(allCases.map((lintCase, index) => [lintCase.name, lintCase, index] as const))(
    "%s",
    (_name, lintCase, index) => {
      const diagnostics = partitionDiagnostics(caseFilename(lintCase, index));

      // Parse errors or stray rules would make a pass case meaningless
      expect(diagnostics.other).toStrictEqual([]);
      expect(diagnostics.rule).toHaveLength(lintCase.errors);
    },
    30_000,
  );
});
