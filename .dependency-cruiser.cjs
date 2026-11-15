/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ["type-only"] } },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "[.]d[.](?:c|m)?ts$",
          "(^|/)fixtures/",
          "(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$",
          "(^|/)tsconfig[.]json$",
          "(^|/)[^/]+[.]config[.](?:js|cjs|mjs|ts|cts|mts|json)$",
        ],
      },
      to: {},
    },
    {
      name: "no-deprecated-core",
      severity: "error",
      from: {},
      to: {
        dependencyTypes: ["core"],
        path: [
          "^(?:punycode|domain|constants|sys|_linklist|_stream_wrap)$",
          "^v8/tools/",
          "^node-inspect/lib/",
        ],
      },
    },
    {
      name: "not-to-deprecated",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["deprecated"] },
    },
    {
      name: "no-non-package-json",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-duplicate-dep-types",
      severity: "warn",
      from: {},
      to: {
        moreThanOneDependencyType: true,
        dependencyTypesNot: ["type-only", "npm-peer"],
      },
    },
    {
      name: "not-to-test",
      severity: "error",
      from: {
        pathNot: [
          "(^|/)(?:test|tests|__tests__|__mocks__|e2e|fixtures)/",
          "[.](?:spec|test)[.](?:[cm]?[jt]sx?)$",
        ],
      },
      to: {
        path: [
          "(^|/)(?:test|tests|__tests__|__mocks__|e2e|fixtures)/",
          "[.](?:spec|test)[.](?:[cm]?[jt]sx?)$",
        ],
      },
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      from: {
        path: "^(?:src|admin/src|lib|app|source)/",
        pathNot: [
          "[.](?:spec|test|stories)[.](?:[cm]?[jt]sx?)$",
          "[.]d[.](?:c|m)?ts$",
          "(^|/)(?:test|tests|__tests__|__mocks__|fixtures)/",
        ],
      },
      to: {
        dependencyTypes: ["npm-dev"],
        dependencyTypesNot: ["type-only", "npm-peer"],
      },
    },
    {
      name: "peer-deps-used",
      severity: "warn",
      from: {},
      to: { dependencyTypes: ["npm-peer"], dependencyTypesNot: ["npm-dev"] },
    },
    {
      name: "no-upward-layer-import",
      severity: "error",
      from: {
        path: "^(?:src|admin/src|lib|app|source)/(?:shared|utils|common|domain|core)/",
      },
      to: {
        path: "^(?:src|admin/src|lib|app|source)/(?:services|application|features|ui|components|pages|routes|cli|server|bin)/",
      },
    },
  ],
  options: {
    // Resolve external edges, but cruise each linked workspace package separately.
    doNotFollow: { path: ["node_modules", "^[.][.]/"] },
    exclude: {
      path: [
        "(^|/)[.]git/",
        "^(?:dist|build|out|coverage)/",
        "(^|/)[.](?:turbo|cache)/",
        "[.]min[.](?:js|cjs|mjs)$",
      ],
    },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "require", "node", "default"],
      mainFields: ["module", "main", "types", "typings"],
      extensions: [
        ".ts",
        ".tsx",
        ".mts",
        ".cts",
        ".js",
        ".jsx",
        ".mjs",
        ".cjs",
        ".json",
        ".d.ts",
      ],
    },
    moduleSystems: ["es6", "cjs", "tsd", "amd"],
  },
};
