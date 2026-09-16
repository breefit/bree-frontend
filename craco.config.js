// craco.config.js
const path = require("path");

// CRA loads environment files after this config is evaluated. Pre-load them
// here so a plain .env cannot override .env.production during `craco build`.
//
// FIX (Medium #28 — Phase 3): this used to force-load a single plain `.env`
// for every non-production run (dev and test alike) BEFORE CRA's own
// env.js got a chance to run. Since dotenv never overrides a process.env
// key that's already set, that meant `.env.development` — which CRA's real
// precedence ranks ABOVE plain `.env` — could never win for any key `.env`
// also defined during `npm start`: a silent override footgun for local
// dev, not just the production-build case this file's own comment
// describes. Now replicates react-scripts/config/env.js's exact file list
// and precedence order (highest priority first; `.env.local` excluded for
// NODE_ENV=test, matching CRA's own convention that tests should produce
// the same result on every machine) instead of a single hardcoded file.
const nodeEnv = process.env.NODE_ENV || "development";
const dotenvFiles = [
  `.env.${nodeEnv}.local`,
  nodeEnv !== "test" && ".env.local",
  `.env.${nodeEnv}`,
  ".env",
].filter(Boolean);

for (const file of dotenvFiles) {
  require("dotenv").config({ path: path.resolve(__dirname, file) });
}

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    configure: (webpackConfig) => {
      // Add ignored patterns to reduce watched directories
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/build/**",
          "**/dist/**",
          "**/coverage/**",
          "**/public/**",
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // Add health check endpoints if enabled
  if (
    config.enableHealthCheck &&
    setupHealthEndpoints &&
    healthPluginInstance
  ) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

// FIX (ISSUE-005 — frontend behavioral test coverage): `craco test` (Jest)
// never had the `@` -> `src/` alias webpack already resolves for the dev
// server/build, so no test could import a component that uses a `@/...`
// import. Scoped to the Jest config only — does not touch webpack/dev
// server/build behavior at all.
webpackConfig.jest = {
  configure: (jestConfig) => {
    jestConfig.moduleNameMapper = {
      ...jestConfig.moduleNameMapper,
      "^@/(.*)$": path.resolve(__dirname, "src") + "/$1",
    };
    return jestConfig;
  },
};

// Wrap with visual edits (automatically adds babel plugin, dev server, and overlay in dev mode)
if (isDevServer) {
  try {
    const { withVisualEdits } = require("@emergentbase/visual-edits/craco");
    webpackConfig = withVisualEdits(webpackConfig);
  } catch (err) {
    if (
      err.code === "MODULE_NOT_FOUND" &&
      err.message.includes("@emergentbase/visual-edits/craco")
    ) {
      console.warn(
        "[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled.",
      );
    } else {
      throw err;
    }
  }
}

module.exports = webpackConfig;
