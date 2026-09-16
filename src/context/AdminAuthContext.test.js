import { render, screen, act, waitFor } from "@testing-library/react";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import { getAdminToken, clearAdminToken } from "@/lib/tokenStore";
import axios from "@/lib/api";

/**
 * ISSUE-008 — JWT tokens stored in localStorage (admin token — highest
 * blast radius per the audit).
 *
 * Real behavioral tests for the admin auth flow after moving the admin
 * token out of localStorage into memory only. Also covers the mount-time
 * bug this fix had to correct along the way: the old code only called
 * verifyAdmin() on mount if a localStorage token was already present
 * ("avoids 401 spam on public pages") — with an in-memory-only token that
 * never survives a reload, that gate would have made a refreshed admin
 * page always look logged out even with a perfectly valid httpOnly
 * cookie. verifyAdmin() now runs unconditionally on mount, the same
 * pattern AuthContext.js's checkAuth() already used correctly.
 */

const mockAdmin = { id: "admin-1", name: "Test Admin", email: "admin@example.com" };

const TestConsumer = ({ onReady }) => {
  const auth = useAdminAuth();
  onReady(auth);
  return (
    <div>
      <div data-testid="admin">{auth.admin ? auth.admin.name : "no-admin"}</div>
      <div data-testid="loading">{String(auth.loading)}</div>
    </div>
  );
};

const meAdapter = ({ authenticated }) => (config) => {
  if (config.url === "/api/admin/me") {
    if (authenticated) {
      return Promise.resolve({ data: { admin: mockAdmin }, status: 200, statusText: "OK", headers: {}, config });
    }
    return Promise.reject({ response: { status: 401, data: {} }, config, isAxiosError: true });
  }
  if (config.url === "/api/admin/login") {
    return Promise.resolve({
      data: { admin: mockAdmin, token: "fresh-admin-token" },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });
  }
  if (config.url === "/api/admin/logout") {
    return Promise.resolve({ data: {}, status: 200, statusText: "OK", headers: {}, config });
  }
  return Promise.reject(new Error(`Unhandled request in test: ${config.url}`));
};

let originalAdapter;

beforeEach(() => {
  clearAdminToken();
  originalAdapter = axios.defaults.adapter;
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  clearAdminToken();
});

test("ISSUE-008 (admin authentication): page load / refresh with a valid admin session cookie authenticates via GET /api/admin/me — no stored token needed to trigger the check", async () => {
  axios.defaults.adapter = meAdapter({ authenticated: true });
  render(
    <AdminAuthProvider>
      <TestConsumer onReady={() => {}} />
    </AdminAuthProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("admin").textContent).toBe("Test Admin"));
});

test("ISSUE-008 (admin authentication): page load / refresh with no admin session sets admin to null, no token stored", async () => {
  axios.defaults.adapter = meAdapter({ authenticated: false });
  render(
    <AdminAuthProvider>
      <TestConsumer onReady={() => {}} />
    </AdminAuthProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
  expect(screen.getByTestId("admin").textContent).toBe("no-admin");
  expect(getAdminToken()).toBeNull();
});

test("ISSUE-008 (admin authentication): login stores the admin token in memory, not localStorage", async () => {
  axios.defaults.adapter = meAdapter({ authenticated: false });
  let authApi;
  render(
    <AdminAuthProvider>
      <TestConsumer onReady={(a) => (authApi = a)} />
    </AdminAuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

  const lsSetSpy = jest.spyOn(Storage.prototype, "setItem");
  await act(async () => {
    await authApi.loginAdmin("admin@example.com", "password123");
  });

  expect(screen.getByTestId("admin").textContent).toBe("Test Admin");
  expect(getAdminToken()).toBe("fresh-admin-token");
  expect(lsSetSpy).not.toHaveBeenCalledWith("bree_admin_token", expect.anything());
  lsSetSpy.mockRestore();
});

test("ISSUE-008 (admin authentication): an authenticated admin API call after login attaches the in-memory admin token as a Bearer header", async () => {
  axios.defaults.adapter = meAdapter({ authenticated: false });
  let authApi;
  render(
    <AdminAuthProvider>
      <TestConsumer onReady={(a) => (authApi = a)} />
    </AdminAuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

  await act(async () => {
    await authApi.loginAdmin("admin@example.com", "password123");
  });

  let captured;
  await axios.get("/api/admin/orders", {
    adapter: (config) => {
      captured = config;
      return Promise.resolve({ data: [], status: 200, statusText: "OK", headers: {}, config });
    },
  });

  expect(captured.headers.Authorization).toBe("Bearer fresh-admin-token");
});

test("ISSUE-008 (admin authentication): logout clears the admin and the in-memory token", async () => {
  axios.defaults.adapter = meAdapter({ authenticated: false });
  let authApi;
  render(
    <AdminAuthProvider>
      <TestConsumer onReady={(a) => (authApi = a)} />
    </AdminAuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

  await act(async () => {
    await authApi.loginAdmin("admin@example.com", "password123");
  });
  expect(getAdminToken()).toBe("fresh-admin-token");

  await act(async () => {
    await authApi.logoutAdmin();
  });

  expect(screen.getByTestId("admin").textContent).toBe("no-admin");
  expect(getAdminToken()).toBeNull();
});

test("ISSUE-008 (admin authentication): a page reload (fresh provider mount) re-authenticates via the cookie even with no leftover in-memory token — the exact bug the old localStorage-gated mount check would have hit", async () => {
  // First "page load": admin logs in, token is in memory.
  axios.defaults.adapter = meAdapter({ authenticated: false });
  let authApi;
  const { unmount } = render(
    <AdminAuthProvider>
      <TestConsumer onReady={(a) => (authApi = a)} />
    </AdminAuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
  await act(async () => {
    await authApi.loginAdmin("admin@example.com", "password123");
  });
  expect(getAdminToken()).toBe("fresh-admin-token");

  // Real reload: the JS runtime restarts, losing the in-memory token.
  clearAdminToken();
  unmount();

  axios.defaults.adapter = meAdapter({ authenticated: true });
  render(
    <AdminAuthProvider>
      <TestConsumer onReady={() => {}} />
    </AdminAuthProvider>,
  );

  // Must NOT stay stuck on "no-admin" just because there's no stored
  // token to gate the check on — this is the exact regression the old
  // "only verify if a token is stored" mount effect would have caused.
  await waitFor(() => expect(screen.getByTestId("admin").textContent).toBe("Test Admin"));
});
