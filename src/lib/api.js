import axios from "axios";

const normalizeBaseUrl = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/api\/?$/, "").replace(/\/$/, "");
};

const BACKEND_URL = normalizeBaseUrl(
  process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_API_URL || "",
);

axios.defaults.baseURL = BACKEND_URL;
axios.defaults.withCredentials = true;
axios.defaults.timeout = 20000;
axios.defaults.headers.common.Accept = "application/json";

axios.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const requestPath = getRequestPath(config.url);

    if (requestPath.startsWith("/api/admin")) {
      const adminToken = localStorage.getItem("bree_admin_token");
      if (adminToken) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${adminToken}`;
      }
    } else {
      // SAFARI FIX: user routes previously relied on the `auth_token` cookie
      // alone (SameSite=None; Secure). Safari/WebKit has a well-known race
      // where a cookie set by a cross-site XHR/fetch response (login,
      // register, Google auth) is not always available to the very next
      // request fired immediately after — even though the cookie itself is
      // configured correctly. The backend's `auth`/`optionalAuth`
      // middleware already accepts `cookieToken || bearerToken`
      // (middleware/auth.js), so attaching the access token we already
      // store in localStorage on login closes that race without any
      // backend change: the request succeeds via the header even if the
      // cookie hasn't "landed" yet in Safari's jar.
      const userToken = localStorage.getItem("bree_access_token");
      if (userToken && !config.headers?.Authorization) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${userToken}`;
      }
    }
  }
  config.withCredentials = true;
  return config;
});

const getRequestPath = (url) => {
  if (!url) return "";
  try {
    if (url.startsWith("http")) {
      return new URL(url).pathname;
    }
  } catch {
    // ignore invalid URL
  }
  return url;
};

// FIX #4: Replace the plain boolean flag with a promise-based refresh queue.
// When multiple requests fail with 401 at the same time (e.g. GET /api/addresses
// and GET /api/profile fire concurrently), only the first triggers a token
// refresh. All subsequent failing requests subscribe to that same refresh
// promise and are automatically retried once the new token is ready — instead
// of being silently dropped.
let refreshPromise = null;

const triggerRefresh = () => {
  if (!refreshPromise) {
    refreshPromise = axios.get("/api/auth/verify").finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

const logoutPaths = ["/api/profile", "/api/addresses", "/api/orders"];

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!error.response) {
      error.message =
        "Unable to reach the backend. Check your network or backend server.";
      return Promise.reject(error);
    }

    if (error.response.status === 429) {
      error.message = "Too many attempts. Please wait a moment and try again.";
      return Promise.reject(error);
    }

    if (error.response.status === 401) {
      const requestPath = getRequestPath(error.config?.url);

      // Don't fire auth:expired for the verify endpoint itself
      const isVerifyCall = requestPath === "/api/auth/verify";

      // Don't retry if this request is already a retry
      const isRetry = error.config?._retry;

      if (
        !isVerifyCall &&
        !isRetry &&
        logoutPaths.some((path) => requestPath.startsWith(path))
      ) {
        try {
          // All concurrent 401s share one refresh attempt via triggerRefresh().
          // The first call starts it; every subsequent call awaits the same promise.
          await triggerRefresh();

          // Refresh succeeded — retry the original request once
          error.config._retry = true;
          return axios(error.config);
        } catch {
          // Refresh itself returned 401 — session is truly gone
          window.dispatchEvent(new Event("auth:expired"));
        }
      }
    }

    const backendMessage = error.response.data?.message;
    if (backendMessage) {
      error.message = backendMessage;
    }

    return Promise.reject(error);
  },
);

export const getApiErrorMessage = (error) => {
  if (!error) return "Something went wrong. Please try again.";
  if (typeof error === "string") return error;
  if (error.response?.status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (error.response?.data?.message) return error.response.data.message;
  if (error.message) return error.message;
  return "An unexpected error occurred. Please refresh and try again.";
};

export const fetchOrderSuccess = async (orderId) => {
  if (!orderId) {
    throw new Error("Order ID is required");
  }
  return axios.get(`/api/orders/${orderId}/success`);
};

export default axios;
