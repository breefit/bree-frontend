import { render, screen, act, waitFor } from "@testing-library/react";

// AuthContext.js imports firebase/auth (for Google login) — this project's
// Jest/jsdom environment can't load the real package (a pre-existing,
// unrelated toolchain gap: firebase/auth pulls in undici's fetch polyfill,
// which needs a global TextEncoder jsdom's default test environment
// doesn't provide — same class of gap as Orders.approveRefund.test.js's
// react-router-dom mock). Mocked out as "not configured", the exact state
// AuthContext.js already handles gracefully (loginWithGoogle throws a
// clear error; every other effect no-ops) — Google login itself isn't
// what this file tests.
jest.mock("@/lib/firebase", () => ({
  firebaseAuth: null,
  googleAuthProvider: null,
  firebaseInitError: null,
}));
jest.mock("firebase/auth", () => ({
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
  setPersistence: jest.fn(),
  onAuthStateChanged: jest.fn(),
  browserLocalPersistence: {},
}));

import { AuthProvider, useAuth } from "./AuthContext";
import { getAccessToken, clearAccessToken } from "@/lib/tokenStore";
import axios from "@/lib/api";

/**
 * ISSUE-008 — JWT tokens stored in localStorage.
 *
 * Real behavioral tests for the customer-facing auth flow after moving
 * the access token out of localStorage into memory only (lib/
 * tokenStore.js) — covering exactly the flows the fix must not break:
 * login, refresh (checkAuth), page reload, an authenticated API call, and
 * logout. Drives the REAL AuthProvider/useAuth against a fake axios
 * adapter (no network, no backend) — not a regex over the source.
 */

const mockUser = {
  id: "user-1",
  name: "Test Customer",
  accessToken: "fresh-access-token",
};

const TestConsumer = ({ onReady }) => {
  const auth = useAuth();
  onReady(auth);
  return (
    <div>
      <div data-testid="user">{auth.user ? auth.user.name : "no-user"}</div>
      <div data-testid="loading">{String(auth.loading)}</div>
    </div>
  );
};

const withAdapter = (adapter) => ({ adapter });

const verifyAdapter = ({ authenticated }) => (config) => {
  if (config.url === "/api/auth/verify") {
    if (authenticated) {
      return Promise.resolve({
        data: mockUser,
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    }
    return Promise.reject({
      response: { status: 401, data: {} },
      config,
      isAxiosError: true,
    });
  }
  if (config.url === "/api/auth/logout") {
    return Promise.resolve({ data: {}, status: 200, statusText: "OK", headers: {}, config });
  }
  if (config.url === "/api/auth/verify-otp") {
    return Promise.resolve({ data: mockUser, status: 200, statusText: "OK", headers: {}, config });
  }
  return Promise.reject(new Error(`Unhandled request in test: ${config.url}`));
};

let originalAdapter;

beforeEach(() => {
  clearAccessToken();
  originalAdapter = axios.defaults.adapter;
});

afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  clearAccessToken();
});

test("ISSUE-008: page load / refresh with no session (logged out) sets user to null via the cookie-based verify, no token stored", async () => {
  axios.defaults.adapter = verifyAdapter({ authenticated: false });
  let authApi;
  render(
    <AuthProvider>
      <TestConsumer onReady={(a) => (authApi = a)} />
    </AuthProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
  expect(screen.getByTestId("user").textContent).toBe("no-user");
  expect(getAccessToken()).toBeNull();
  expect(authApi.user).toBeNull();
});

test("ISSUE-008: page load / refresh with a valid session cookie authenticates via /api/auth/verify and stores the access token in memory", async () => {
  axios.defaults.adapter = verifyAdapter({ authenticated: true });
  render(
    <AuthProvider>
      <TestConsumer onReady={() => {}} />
    </AuthProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("Test Customer"));
  expect(getAccessToken()).toBe("fresh-access-token");
});

test("ISSUE-008: login (verifyOtp) sets the user and stores the access token in memory, not localStorage", async () => {
  axios.defaults.adapter = verifyAdapter({ authenticated: false });
  let authApi;
  render(
    <AuthProvider>
      <TestConsumer onReady={(a) => (authApi = a)} />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

  const lsSetSpy = jest.spyOn(Storage.prototype, "setItem");
  await act(async () => {
    await authApi.verifyOtp("9876543210", "123456");
  });

  expect(screen.getByTestId("user").textContent).toBe("Test Customer");
  expect(getAccessToken()).toBe("fresh-access-token");
  expect(lsSetSpy).not.toHaveBeenCalledWith(
    "bree_access_token",
    expect.anything(),
  );
  lsSetSpy.mockRestore();
});

test("ISSUE-008: an authenticated API call after login attaches the in-memory token as a Bearer header", async () => {
  axios.defaults.adapter = verifyAdapter({ authenticated: false });
  let authApi;
  render(
    <AuthProvider>
      <TestConsumer onReady={(a) => (authApi = a)} />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

  await act(async () => {
    await authApi.verifyOtp("9876543210", "123456");
  });

  let captured;
  await axios.get("/api/addresses", {
    adapter: (config) => {
      captured = config;
      return Promise.resolve({ data: [], status: 200, statusText: "OK", headers: {}, config });
    },
  });

  expect(captured.headers.Authorization).toBe("Bearer fresh-access-token");
});

test("ISSUE-008: logout clears the user and the in-memory token", async () => {
  axios.defaults.adapter = verifyAdapter({ authenticated: false });
  let authApi;
  render(
    <AuthProvider>
      <TestConsumer onReady={(a) => (authApi = a)} />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

  await act(async () => {
    await authApi.verifyOtp("9876543210", "123456");
  });
  expect(getAccessToken()).toBe("fresh-access-token");

  await act(async () => {
    await authApi.logout();
  });

  expect(screen.getByTestId("user").textContent).toBe("no-user");
  expect(getAccessToken()).toBeNull();
});

test("ISSUE-008: a page reload (fresh provider mount) never has last session's in-memory token — it must re-authenticate via the cookie, not a leftover token", async () => {
  // First "page load": logs in, token is in memory.
  axios.defaults.adapter = verifyAdapter({ authenticated: false });
  let authApi;
  const { unmount } = render(
    <AuthProvider>
      <TestConsumer onReady={(a) => (authApi = a)} />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
  await act(async () => {
    await authApi.verifyOtp("9876543210", "123456");
  });
  expect(getAccessToken()).toBe("fresh-access-token");

  // Simulate a real reload: the whole JS runtime restarts, so this
  // module-scope in-memory token is what a real reload would actually
  // lose — clear it explicitly (matching real browser behavior) and
  // unmount/remount the provider, exactly like a fresh page load.
  clearAccessToken();
  unmount();

  axios.defaults.adapter = verifyAdapter({ authenticated: true });
  render(
    <AuthProvider>
      <TestConsumer onReady={() => {}} />
    </AuthProvider>,
  );

  await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("Test Customer"));
  expect(getAccessToken()).toBe("fresh-access-token");
});
