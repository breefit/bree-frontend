// ISSUE-029 — Checkout.js's devLog helper used to read `import.meta.env.DEV`,
// a Vite-only construct. This project is CRA/craco (webpack), which does
// not define `import.meta.env` — every one of devLog's 25+ call sites
// throughout Checkout.js (the single most business-critical page in the
// app) would throw `TypeError: Cannot read properties of undefined
// (reading 'DEV')` at runtime the instant devLog was ever called.
//
// This test drives the REAL exported devLog function (not a regex over the
// source) across both NODE_ENV values, proving it never throws and
// correctly gates console output via the standard CRA mechanism
// (process.env.NODE_ENV) instead.

// Checkout.js's top-level imports include react-router-dom (via
// useNavigate) — this project's installed react-router-dom/Jest resolver
// combination cannot currently resolve its "react-router/dom" subpath
// import outside a real app build (see Orders.approveRefund.test.js for
// the same pre-existing toolchain gap). Mocking it out lets Checkout.js's
// module load for real with zero effect on devLog's own behavior.
jest.mock("react-router-dom", () => ({
  useNavigate: () => () => {},
}));

import { devLog } from "./Checkout";

const withNodeEnv = (value, fn) => {
  const original = process.env.NODE_ENV;
  Object.defineProperty(process.env, "NODE_ENV", { value, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: original,
      configurable: true,
    });
  }
};

test("ISSUE-029: devLog never throws — the original import.meta.env.DEV construct would throw on every call in this webpack/CRA project", () => {
  withNodeEnv("development", () => {
    expect(() => devLog("checkout debug", { orderId: "1" })).not.toThrow();
  });
  withNodeEnv("production", () => {
    expect(() => devLog("checkout debug", { orderId: "1" })).not.toThrow();
  });
  withNodeEnv("test", () => {
    expect(() => devLog("checkout debug")).not.toThrow();
  });
});

test("ISSUE-029: devLog logs to the console outside production, matching the original dev-visibility intent", () => {
  const spy = jest.spyOn(console, "log").mockImplementation(() => {});
  withNodeEnv("development", () => {
    devLog("hello", 1, 2);
  });
  expect(spy).toHaveBeenCalledWith("hello", 1, 2);
  spy.mockRestore();
});

test("ISSUE-029: devLog is silent in production builds", () => {
  const spy = jest.spyOn(console, "log").mockImplementation(() => {});
  withNodeEnv("production", () => {
    devLog("should not appear");
  });
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
