/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-core-to-adapters",
      severity: "error",
      comment:
        "Core must stay framework-only and must not depend on adapter implementations.",
      from: {
        path: "^src/core/",
        pathNot: "[.](?:spec|test)[.](?:ts|tsx)$",
      },
      to: { path: "^src/adapters/" },
    },
    {
      name: "no-production-to-tests",
      severity: "error",
      comment:
        "Production modules must not import tests or test-only helpers.",
      from: {
        path: "^src/",
        pathNot: [
          "^src/__tests__/",
          "[.](?:spec|test)[.](?:ts|tsx)$",
          "^src/adapters/react/setup-dom[.]ts$",
        ],
      },
      to: {
        path: [
          "^src/__tests__/",
          "[.](?:spec|test)[.](?:ts|tsx)$",
        ],
      },
    },
    {
      name: "no-core-to-peer-runtime-libs",
      severity: "error",
      comment:
        "Core must not depend on peer runtime libraries such as react, fastify, or postgres.",
      from: { path: "^src/core/" },
      to: {
        dependencyTypes: ["npm-peer"],
      },
    },
    {
      name: "no-fastify-to-other-adapters",
      severity: "error",
      comment: "Adapters should not depend on other adapters directly.",
      from: {
        path: "^src/adapters/fastify/",
        pathNot: "[.](?:spec|test)[.](?:ts|tsx)$",
      },
      to: { path: "^src/adapters/(?:filesystem|in-memory|postgres|react)/" },
    },
    {
      name: "no-filesystem-to-other-adapters",
      severity: "error",
      comment: "Adapters should not depend on other adapters directly.",
      from: {
        path: "^src/adapters/filesystem/",
        pathNot: "[.](?:spec|test)[.](?:ts|tsx)$",
      },
      to: { path: "^src/adapters/(?:fastify|in-memory|postgres|react)/" },
    },
    {
      name: "no-in-memory-to-other-adapters",
      severity: "error",
      comment: "Adapters should not depend on other adapters directly.",
      from: {
        path: "^src/adapters/in-memory/",
        pathNot: "[.](?:spec|test)[.](?:ts|tsx)$",
      },
      to: { path: "^src/adapters/(?:fastify|filesystem|postgres|react)/" },
    },
    {
      name: "no-postgres-to-other-adapters",
      severity: "error",
      comment: "Adapters should not depend on other adapters directly.",
      from: {
        path: "^src/adapters/postgres/",
        pathNot: "[.](?:spec|test)[.](?:ts|tsx)$",
      },
      to: { path: "^src/adapters/(?:fastify|filesystem|in-memory|react)/" },
    },
    {
      name: "no-react-to-other-adapters",
      severity: "error",
      comment: "Adapters should not depend on other adapters directly.",
      from: {
        path: "^src/adapters/react/",
        pathNot: "[.](?:spec|test)[.](?:ts|tsx)$",
      },
      to: { path: "^src/adapters/(?:fastify|filesystem|in-memory|postgres)/" },
    },
    {
      name: "no-node-io-outside-adapters",
      severity: "error",
      comment:
        "Direct Node I/O modules belong in adapters only.",
      from: {
        path: "^src/",
        pathNot: "^src/adapters/",
      },
      to: {
        dependencyTypes: ["core"],
        path: "^(?:node:)?(?:fs(?:/promises)?|http2?|https|net|tls|dns|dgram|child_process|worker_threads|readline|stream|zlib)$",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules"],
    },
    includeOnly: ["^src"],
    moduleSystems: ["es6", "cjs"],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx"],
      mainFields: ["module", "main", "types", "typings"],
    },
    builtInModules: {
      add: [
        "bun",
        "bun:ffi",
        "bun:jsc",
        "bun:sqlite",
        "bun:test",
        "bun:wrap",
        "detect-libc",
        "undici",
        "ws",
      ],
    },
    skipAnalysisNotInRules: true,
  },
};
