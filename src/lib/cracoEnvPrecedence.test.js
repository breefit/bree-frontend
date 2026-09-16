import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * PHASE 3 — Medium Issue #28: craco.config.js used to force-load a single
 * plain `.env` before CRA's own env.js ran, for every non-production run.
 * Since dotenv never overrides an already-set process.env key, that meant
 * `.env.development` (which CRA's real precedence ranks ABOVE plain `.env`)
 * could never win for a key `.env` also defined during `npm start` — a
 * silent override footgun. Fixed to replicate react-scripts' own file list
 * and precedence order exactly.
 *
 * This copies the REAL bree-frontend/craco.config.js source (unmodified)
 * into an isolated scratch directory alongside FAKE .env files (never
 * touching the project's real .env/.env.development), spawns a real `node`
 * subprocess that requires it exactly as `craco start`/`craco build` would,
 * and inspects the resulting process.env — proving the actual shipped file's
 * precedence behavior, not a reimplementation of it.
 */

const projectRoot = path.resolve(__dirname, "../..");
const realCracoConfigPath = path.join(projectRoot, "craco.config.js");

const withTempCracoDir = (envFiles, run) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "craco-env-precedence-"));
  try {
    // node_modules is resolved by Node's normal parent-directory lookup —
    // placing the temp dir OUTSIDE the project tree means `require("dotenv")`
    // would fail, so instead we tell node to resolve modules starting from
    // the real project's node_modules via NODE_PATH.
    fs.copyFileSync(realCracoConfigPath, path.join(tmpDir, "craco.config.js"));
    for (const [filename, contents] of Object.entries(envFiles)) {
      fs.writeFileSync(path.join(tmpDir, filename), contents);
    }
    return run(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

const loadEnvViaRealCracoConfig = (envFiles, nodeEnv, keysToRead) =>
  withTempCracoDir(envFiles, (tmpDir) => {
    const script = `
      require(${JSON.stringify(path.join(tmpDir, "craco.config.js"))});
      console.log(JSON.stringify(${JSON.stringify(keysToRead)}.map((k) => process.env[k] ?? null)));
    `;
    const output = execFileSync(process.execPath, ["-e", script], {
      cwd: tmpDir,
      env: {
        ...process.env,
        NODE_ENV: nodeEnv,
        NODE_PATH: path.join(projectRoot, "node_modules"),
        ENABLE_HEALTH_CHECK: "",
      },
      encoding: "utf8",
    });
    // craco.config.js may print warnings (visual-edits not installed) —
    // the JSON payload is always the last line.
    const lastLine = output.trim().split("\n").pop();
    return JSON.parse(lastLine);
  });

test("in dev mode, .env.development wins over plain .env for an overlapping key (the actual regression)", () => {
  const [value] = loadEnvViaRealCracoConfig(
    {
      ".env": "SHARED_KEY=from-plain-env\n",
      ".env.development": "SHARED_KEY=from-dot-env-development\n",
    },
    "development",
    ["SHARED_KEY"],
  );
  expect(value).toBe("from-dot-env-development");
});

test("in dev mode, a key only present in plain .env still loads (fallback still works)", () => {
  const [value] = loadEnvViaRealCracoConfig(
    { ".env": "ONLY_IN_PLAIN=plain-value\n", ".env.development": "OTHER_KEY=x\n" },
    "development",
    ["ONLY_IN_PLAIN"],
  );
  expect(value).toBe("plain-value");
});

test(".env.development.local outranks .env.development (matches react-scripts' own precedence)", () => {
  const [value] = loadEnvViaRealCracoConfig(
    {
      ".env.development": "SHARED_KEY=from-dev\n",
      ".env.development.local": "SHARED_KEY=from-dev-local\n",
    },
    "development",
    ["SHARED_KEY"],
  );
  expect(value).toBe("from-dev-local");
});

test("production build still prefers .env.production over plain .env (the original fix's intent, preserved)", () => {
  const [value] = loadEnvViaRealCracoConfig(
    { ".env": "SHARED_KEY=from-plain-env\n", ".env.production": "SHARED_KEY=from-dot-env-production\n" },
    "production",
    ["SHARED_KEY"],
  );
  expect(value).toBe("from-dot-env-production");
});

test("NODE_ENV=test does not load .env.local, matching react-scripts' own convention for reproducible tests", () => {
  const [value] = loadEnvViaRealCracoConfig(
    { ".env": "SHARED_KEY=from-plain-env\n", ".env.local": "SHARED_KEY=from-local\n" },
    "test",
    ["SHARED_KEY"],
  );
  expect(value).toBe("from-plain-env");
});
