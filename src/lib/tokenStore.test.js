import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
} from "./tokenStore";
import axios from "./api";

/**
 * ISSUE-008 — JWT tokens stored in localStorage.
 *
 * Both the customer access token and the admin token used to be written
 * to localStorage (bree_access_token / bree_admin_token) alongside the
 * correctly-configured httpOnly cookies — any XSS anywhere in the SPA
 * could read either, and since localStorage persists to disk, exfiltrate
 * a token good for up to 7 days (admin: up to a day, but full admin
 * access). The fix keeps the same "attach the token as a header so the
 * request succeeds even if the cross-site cookie hasn't landed yet in
 * Safari" mechanism (see lib/tokenStore.js's own comment for why that
 * mechanism itself must be kept), but holds the token in memory only.
 *
 * These are real behavioral tests: real module state, and a real axios
 * request run through the real registered interceptor (via a custom
 * adapter that captures the fully-resolved request instead of hitting the
 * network), proving the header is actually attached/omitted correctly —
 * not a regex over AuthContext.js's source.
 */

afterEach(() => {
  clearAccessToken();
  clearAdminToken();
});

test("ISSUE-008: the access token store is in-memory only — nothing is ever written to localStorage or sessionStorage", () => {
  const lsSetSpy = jest.spyOn(Storage.prototype, "setItem");

  setAccessToken("user-token-abc");
  expect(getAccessToken()).toBe("user-token-abc");
  expect(lsSetSpy).not.toHaveBeenCalledWith(
    expect.stringContaining("bree_access_token"),
    expect.anything(),
  );

  clearAccessToken();
  expect(getAccessToken()).toBeNull();

  lsSetSpy.mockRestore();
});

test("ISSUE-008: the admin token store is in-memory only — nothing is ever written to localStorage", () => {
  const lsSetSpy = jest.spyOn(Storage.prototype, "setItem");

  setAdminToken("admin-token-xyz");
  expect(getAdminToken()).toBe("admin-token-xyz");
  expect(lsSetSpy).not.toHaveBeenCalledWith(
    expect.stringContaining("bree_admin_token"),
    expect.anything(),
  );

  clearAdminToken();
  expect(getAdminToken()).toBeNull();

  lsSetSpy.mockRestore();
});

test("ISSUE-008: literally nothing is ever persisted to real localStorage under either legacy key, across a set/clear cycle", () => {
  localStorage.clear();
  setAccessToken("t1");
  setAdminToken("t2");
  expect(localStorage.getItem("bree_access_token")).toBeNull();
  expect(localStorage.getItem("bree_admin_token")).toBeNull();
  clearAccessToken();
  clearAdminToken();
});

// ── The Safari-race mechanism itself must still work — same behavior,
// different (in-memory) source. ─────────────────────────────────────────

const captureRequestConfig = () => {
  let captured = null;
  const adapter = (config) => {
    captured = config;
    return Promise.resolve({
      data: {},
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });
  };
  return { adapter, getCaptured: () => captured };
};

test("ISSUE-008 regression: a non-admin request attaches the in-memory access token as a Bearer header (the Safari-race mitigation), exactly as before", async () => {
  setAccessToken("user-token-abc");
  const { adapter, getCaptured } = captureRequestConfig();

  await axios.get("/api/orders/mine", { adapter });

  expect(getCaptured().headers.Authorization).toBe("Bearer user-token-abc");
});

test("ISSUE-008 regression: an admin request attaches the in-memory ADMIN token, not the user token", async () => {
  setAccessToken("user-token-abc");
  setAdminToken("admin-token-xyz");
  const { adapter, getCaptured } = captureRequestConfig();

  await axios.get("/api/admin/orders", { adapter });

  expect(getCaptured().headers.Authorization).toBe("Bearer admin-token-xyz");
});

test("ISSUE-008 regression: no Authorization header is attached when no token is in memory (e.g. right after a reload, before the cookie-based verify completes)", async () => {
  const { adapter, getCaptured } = captureRequestConfig();

  await axios.get("/api/orders/mine", { adapter });

  expect(getCaptured().headers.Authorization).toBeUndefined();
});

test("ISSUE-008 regression: an explicit Authorization header on the request itself is never overwritten by the stored access token", async () => {
  setAccessToken("user-token-abc");
  const { adapter, getCaptured } = captureRequestConfig();

  await axios.get("/api/orders/mine", {
    adapter,
    headers: { Authorization: "Bearer explicit-token" },
  });

  expect(getCaptured().headers.Authorization).toBe("Bearer explicit-token");
});

test("ISSUE-008 regression: every request still sends cookies (withCredentials), the other half of the auth mechanism", async () => {
  const { adapter, getCaptured } = captureRequestConfig();

  await axios.get("/api/orders/mine", { adapter });

  expect(getCaptured().withCredentials).toBe(true);
});
